'use strict';

const Assert = require('assert');
const Util = require('util');
const AsyncHooks = require('async_hooks');
const wrapEmitter = require('emitter-listener');

const {
    AsyncResource
} = AsyncHooks;

const debug = (str, ...args) =>
    /^\*$|async-local/.test(process.env.DEBUG) &&
    process._rawDebug(`${Util.format(str, ...args)}\n`);

const CONTEXTS_SYMBOL = 'async-local@context';

class AsyncContext extends AsyncResource {
    constructor(inherit) {
        super('AsyncLocalType', {
            triggerAsyncId: AsyncHooks.executionAsyncId()
        });
        this.$inherit = inherit;
    }

    getParentContext() {
        return process._asyncLocal.getContext(this.triggerAsyncId());
    }

    get(name) {
        const val = this[name];
        if (val === undefined && this.$inherit) {
            const parentContext = this.getParentContext()
            return parentContext && parentContext.get(name);
        }

        return val;
    }

    set(name, value) {
        const oldVal = this[name];
        this[name] = value;
        return oldVal;
    }

    bind(fn) {
        const context = this;
        return function contextBound(...args) {
            try {
                return context.runInAsyncScope(fn, this, ...args);
            } catch (err) {
                err['async-local@context'] = context;
                throw err;
            }
        }
    }

    bindEmitter(emitter) {
        Assert.ok(emitter.on && emitter.addListener && emitter.emit, 'Can only bind real event emitter');

        const context = this;
        // Capture the context active at the time the emitter is bound.
        function attach(listener) {
            debug('attaching listener to', context);
            listener[CONTEXTS_SYMBOL] = context;
        }

        // At emit time, bind the listener within the correct context.
        function bind(listener) {
            if (!(listener && listener[CONTEXTS_SYMBOL])) {
                return listener;
            }

            const context = listener[CONTEXTS_SYMBOL];
            debug('listener bind to', context);
            return context.bind(listener);
        }

        wrapEmitter(emitter, attach, bind);
    }
}

let contexts = new Map();

class AsyncLocal {
    /**
     * Special function called by async_hooks
     * @param {Number} asyncId 
     * @param {String} type 
     * @param {Number} triggerAsyncId 
     */
    init(asyncId, type, triggerAsyncId) {
        const parentCtx = contexts.get(triggerAsyncId);
        if (parentCtx) {
            contexts.set(asyncId, parentCtx);
            debug('context propagated', parentCtx, type);
        }
    }

    /**
     * Special function called by async_hooks
     * @param {Number} asyncId 
     */
    destroy(asyncId) {
        contexts.delete(asyncId);
        debug('context destroyed, id:', asyncId);
    }

    getContext(id) {
        id = arguments.length === 0 ? AsyncHooks.executionAsyncId() : id;
        return contexts.get(id);
    }

    get(name) {
        const context = this.getContext();
        if (context) {
            return context.get(name)
        } else {
            throw new Error('No async local context has been set up');
        }
    }

    set(name, value) {
        const context = this.getContext();
        if (context) {
            return context.set(name, value);
        } else {
            throw new Error('No async local context has been set up');
        }
    }

    cleanAll() {
        contexts.clear();
    }

    /**
     * Create run in async local context.
     * @param inherit is a flag that tells to inherit everything from parent context
     * @param next is callback within sub-local context
     */
    async run(inherit, next) {
        const args = [].slice.call(arguments);
        inherit = (args.length < 2 || typeof inherit === 'boolean' && inherit) ? true : false;
        next = args.pop();

        this.enable();

        const context = new AsyncContext(inherit);
        debug('new AsyncLocal context created', context);
        contexts.set(context.asyncId(), context);
        try {
            return await context.runInAsyncScope(next, null, context);
        } catch (err) {
            err['async-local@context'] = context;
            throw err;
        }
    }

    enable() {
        if (this.$asyncHookRef) {
            return;
        }
        this.$asyncHookRef = AsyncHooks.createHook(this);
        this.$asyncHookRef.enable();
    }

    bind(fn) {
        const context = this.getContext();
        if (!context) {
            return fn;
        }

        return context.bind(fn);
    }

    bindEmitter(emitter) {
        const context = this.getContext();

        if (context) {
            context.bindEmitter(emitter);
        }
    }
}

function createAsyncLocalOnce() {
    return process._asyncLocal = process._asyncLocal || new AsyncLocal();
}

// This is our single registry for all async contexts
module.exports = createAsyncLocalOnce();
