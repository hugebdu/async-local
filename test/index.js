'use strict';

const Assert = require('assert');
const { EventEmitter } = require('events');
const AsyncLocal = require('..');

function doneLimit(done, limit) {
    return (err) => {
        if (err) {
            return done(err);
        }
        if (--limit <= 0) {
            done();
        }
    }
}

describe(__filename, () => {
    let parentCtx;

    afterEach(() => {
        AsyncLocal.cleanAll();
    });

    it('should throw error', () => {
        Assert.throws(() => {
            AsyncLocal.get('foo');
        }, /No async local context has been set up/);

        Assert.throws(() => {
            AsyncLocal.set('foo');
        }, /No async local context has been set up/);
    });

    it('should create async hook', (done) => {
        parentCtx = AsyncLocal.getContext();
        Assert.ok(!parentCtx);

        AsyncLocal.run(ctx => {
            Assert.ok(ctx);
            Assert.ok(ctx.asyncId());
            Assert.ok(ctx.triggerAsyncId());
            Assert.ok(!ctx.getParentContext());
            done();
        });

        parentCtx = AsyncLocal.getContext();
        Assert.ok(!parentCtx);
    });

    it('should chain contexts', done => {
        Assert.ok(!AsyncLocal.getContext());
        done = doneLimit(done, 2);
        AsyncLocal.run(ctx => {
            Assert.ok(ctx);
            Assert.ok(ctx.asyncId());
            Assert.ok(ctx.triggerAsyncId());
            Assert.equal(undefined, ctx.get('foo'));
            ctx.set('bar', 'barval');
            ctx.set('foo', 'fooval');
            Assert.equal('fooval', ctx.get('foo'));
            Assert.equal('fooval', AsyncLocal.get('foo'));
            const parentCtx = ctx;

            setImmediate(() => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
                Assert.equal('fooval', ctx.get('foo'));
                Assert.equal('fooval', AsyncLocal.get('foo'));

                AsyncLocal.set('foo', 'foomod');
                Assert.equal('foomod', ctx.get('foo'));
                Assert.equal('foomod', AsyncLocal.get('foo'));
    
                AsyncLocal.run(ctx => {
                    Assert.equal('foomod', ctx.get('foo'));
                    Assert.equal('foomod', AsyncLocal.get('foo'));
                    AsyncLocal.set('foo', 'foo2');
                    Assert.equal('foomod', parentCtx.get('foo'));
                    Assert.equal('foo2', ctx.get('foo'));
                    Assert.equal('foo2', AsyncLocal.get('foo'));

                    Assert.equal('barval', ctx.get('bar'));
                    Assert.equal('barval', AsyncLocal.get('bar'));

                    Assert.ok(parentCtx === ctx.getParentContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    Assert.ok(ctx === AsyncLocal.getContext());
                    done();
                });
            });

            setImmediate(() => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
                Assert.equal('foomod', ctx.get('foo'));
                Assert.equal('foomod', AsyncLocal.get('foo'));
                Assert.equal('barval', ctx.get('bar'));
                Assert.equal('barval', AsyncLocal.get('bar'));

                AsyncLocal.run(ctx => {
                    Assert.equal('foomod', ctx.get('foo'));
                    Assert.equal('foomod', AsyncLocal.get('foo'));
                    Assert.equal('barval', ctx.get('bar'));
                    Assert.equal('barval', AsyncLocal.get('bar'));

                    Assert.ok(parentCtx === ctx.getParentContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    Assert.ok(ctx === AsyncLocal.getContext());
                    done();
                });
            });
        });
    });

    it('should not inherit parent values', done => {
        AsyncLocal.run(ctx => {
            AsyncLocal.set('foo', 'fooval');
            ctx.set('bar', 'barval');
            
            AsyncLocal.run(false, ctx => {
                Assert.equal(undefined, ctx.get('bar'));
                Assert.equal(undefined, AsyncLocal.get('foo'));
                AsyncLocal.set('foo', 'fooval2');

                AsyncLocal.run(true, ctx => {
                    Assert.equal(undefined, ctx.get('bar'));
                    Assert.equal('fooval2', AsyncLocal.get('foo'));
                    done();
                });    
            });
        });
    });

    it('should chain context through promises', async () => {
        let counter = 0;
        await AsyncLocal.run(async ctx => {
            Assert.ok(ctx);
            Assert.ok(ctx.asyncId());
            Assert.ok(ctx.triggerAsyncId());
            const parentCtx = ctx;

            return Promise.all([
                new Promise(resolve => {
                    Assert.ok(parentCtx === AsyncLocal.getContext());
                    AsyncLocal.run(ctx => {
                        Assert.ok(parentCtx === ctx.getParentContext());
                        Assert.ok(parentCtx !== AsyncLocal.getContext());
                        Assert.ok(ctx === AsyncLocal.getContext());
                        counter++;
                        resolve();
                    });
                }),
                new Promise(resolve => {
                    Assert.ok(parentCtx === AsyncLocal.getContext());
                    AsyncLocal.run(ctx => {
                        Assert.ok(parentCtx === ctx.getParentContext());
                        Assert.ok(parentCtx !== AsyncLocal.getContext());
                        Assert.ok(ctx === AsyncLocal.getContext());
                        counter++;
                        resolve();
                    });
                })
            ]);
        });

        Assert.equal(2, counter);
    });

    it('should preserve context through resolve', async () => {
        await AsyncLocal.run(async ctx => {
            const parentCtx = ctx;

            const promise = new Promise(resolve => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
                AsyncLocal.run(ctx => {
                    Assert.ok(parentCtx === ctx.getParentContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    Assert.ok(ctx === AsyncLocal.getContext());
                    resolve();
                });
            });

            await promise.then(() => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
            }).then(() => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
            });
        });
    });

    it('should preserve context through reject', async () => {
        await AsyncLocal.run(async ctx => {
            const parentCtx = ctx;

            const promise = new Promise((resolve, reject) => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
                AsyncLocal.run(ctx => {
                    Assert.ok(parentCtx === ctx.getParentContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    Assert.ok(ctx === AsyncLocal.getContext());
                    reject(new Error('BOOM'));
                });
            });

            await promise.catch(err => {
                Assert.equal('BOOM', err.message);
                Assert.ok(parentCtx === AsyncLocal.getContext());
            }).then(() => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
            });
        });
    });

    it('should bind context to a function', async () => {
        await AsyncLocal.run(async ctx => {
            const parentCtx = ctx;
            Assert.ok(parentCtx === AsyncLocal.getContext());

            const origFn = () => {
                Assert.ok(parentCtx === AsyncLocal.getContext());
                return 'ok'
            };
            const fn = AsyncLocal.bind(origFn);
            Assert.ok(fn !== origFn);

            Assert.equal('ok', fn());

            await AsyncLocal.run(async ctx => {
                Assert.ok(parentCtx !== AsyncLocal.getContext());
                Assert.equal('ok', fn());
            });
        });
    });

    it('should bind no context to a function', async () => {
        const fn = () => {
            Assert.ok(parentCtx === AsyncLocal.getContext());
            return 'ok'
        };

        const newfn = AsyncLocal.bind(fn);
        Assert.ok(fn === newfn);
    });

    it('should bind context to a function and attach context to sync error', async () => {
        await AsyncLocal.run(async ctx => {
            const fn = AsyncLocal.bind(() => {
                throw new Error('BOOM');
            });

            let error;
            try {
                fn();
            }
            catch (err) {
                error = err;
            }

            Assert.equal('BOOM', error.message);
            Assert.ok(ctx === error['async-local@context']);
        });
    });

    it('should attach context to sync error', async () => {
        let error;
        let context;
        try {
            await AsyncLocal.run(async ctx => {
                context = ctx;
                throw new Error('BOOM');
            });
        }
        catch (err) {
            error = err;
        }

        Assert.equal('BOOM', error.message);
        Assert.ok(context === error['async-local@context']);
    });

    it('should attach context to sync error in promise', async () => {
        let error;
        let context;
        try {
            await AsyncLocal.run(ctx => {
                context = ctx;
                throw new Error('BOOM');
            });
        }
        catch (err) {
            error = err;
        }

        Assert.equal('BOOM', error.message);
        Assert.ok(context === error['async-local@context']);
    });

    it('should not bind emitter when there is no context', done => {
        const emitter = new EventEmitter();
        AsyncLocal.bindEmitter(emitter);
        // just to make sure it still works
        emitter.on('event', () => {
            Assert.ok(!AsyncLocal.getContext());
            done();
        });

        emitter.emit('event');
    });

    it('should fail to bind to non-emiter', done => {
        AsyncLocal.run(() => {
            Assert.throws(() => {
                AsyncLocal.bindEmitter({});
            }, /Can only bind real event emitter/);
            done();
        });
    });

    it('should propagate active context to listeners', done => {
        done = doneLimit(done, 1);
        let parentCtx;
        const emitter = new EventEmitter();

        emitter.on('event', evt => {
            Assert.equal('ok', evt);
            Assert.ok(parentCtx !== AsyncLocal.getContext());
            done();
        });

        AsyncLocal.run(ctx => {
            parentCtx = ctx;
            Assert.ok(parentCtx === AsyncLocal.getContext());

            emitter.on('event', evt => {
                Assert.equal('ok', evt);
                Assert.ok(parentCtx === AsyncLocal.getContext());
                done();
            });

            emitter.on('error', err => {
                Assert.equal('BOOM', err.message);
                Assert.ok(parentCtx === AsyncLocal.getContext());
                done();
            });

            AsyncLocal.run(ctx => {
                Assert.ok(ctx === AsyncLocal.getContext());
                emitter.on('event', evt => {
                    Assert.equal('ok', evt);
                    Assert.ok(ctx === AsyncLocal.getContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    done();
                });

                emitter.on('error', err => {
                    Assert.equal('BOOM', err.message);
                    Assert.ok(ctx === AsyncLocal.getContext());
                    Assert.ok(parentCtx !== AsyncLocal.getContext());
                    done();
                });

                Assert.ok(parentCtx !== AsyncLocal.getContext());
                emitter.emit('event', 'ok');
                setTimeout(() => {
                    emitter.emit('error', new Error('BOOM'));
                }, 10);
            });
        });
    });

    it('should bind context to event emitter', done => {
        done = doneLimit(done, 5);
        let parentCtx;
        const emitter = new EventEmitter();

        emitter.on('event', evt => {
            Assert.equal('ok', evt);
            Assert.ok(parentCtx !== AsyncLocal.getContext());
            done();
        });

        AsyncLocal.run(ctx => {
            parentCtx = ctx;
            Assert.ok(parentCtx === AsyncLocal.getContext());
            AsyncLocal.bindEmitter(emitter);

            emitter.on('event', evt => {
                Assert.equal('ok', evt);
                Assert.ok(parentCtx === AsyncLocal.getContext());
                done();
            });

            emitter.on('error', err => {
                Assert.equal('BOOM', err.message);
                Assert.ok(parentCtx === AsyncLocal.getContext());
                done();
            });

            AsyncLocal.run(ctx => {
                Assert.ok(ctx === AsyncLocal.getContext());
                emitter.on('event', evt => {
                    Assert.equal('ok', evt);
                    Assert.ok(ctx !== AsyncLocal.getContext());
                    Assert.ok(parentCtx === AsyncLocal.getContext());
                    done();
                });

                emitter.on('error', err => {
                    Assert.equal('BOOM', err.message);
                    Assert.ok(ctx !== AsyncLocal.getContext());
                    Assert.ok(parentCtx === AsyncLocal.getContext());
                    done();
                });

                Assert.ok(parentCtx !== AsyncLocal.getContext());
                emitter.emit('event', 'ok');
                setTimeout(() => {
                    emitter.emit('error', new Error('BOOM'));
                }, 10);
            });
        });
    });
});
