# async-local

![codecov](https://codecov.io/gh/dimichgh/async-local/branch/master/graph/badge.svg)](https://codecov.io/gh/dimichgh/async-local)
[![Build Status](https://travis-ci.org/dimichgh/async-local.svg?branch=master)](https://travis-ci.org/dimichgh/async-local) [![NPM](https://img.shields.io/npm/v/async-local.svg)](https://www.npmjs.com/package/async-local)
[![Downloads](https://img.shields.io/npm/dm/async-local.svg)](http://npm-stat.com/charts.html?package=async-local)
[![Known Vulnerabilities](https://snyk.io/test/github/dimichgh/async-local/badge.svg)](https://snyk.io/test/github/dimichgh/async-local)

async_hooks based local storage aka thread-local concept in java world.

The module provides a single layer of local storage for async flow, which is more than enough for a big platform.

## Install

```bash
npm -i async-local
```

## Usage

### Express middleware example

```javascript
const AsyncLocal = require('async-local');
const express = require('express');
const app = express();
app.use((req, res, next) => {
    AsyncLocal.run(next);
});
```

### Storing/reading data

```javascript
const AsyncLocal = require('async-local');
console.log(AsyncLocal.get('foo')); // >>> undefined
AsyncLocal.set('foo', 'bar'); // >>> throw error if no context is setup

AsyncLocal.run(ctx => {
    AsyncLocal.set('foo', 'bar');
    // or
    ctx.set('foo', 'bar');

    const promise = Promise.resolve();;

    AsyncLocal.run(ctx => {
        console.log(ctx.get('foo')); // >>> bar
        console.log(AsyncLocal.get('foo')); // >>> bar
        AsyncLocal.set('foo', 'qaz');
        console.log(ctx.get('foo')); // >>> qaz
        console.log(AsyncLocal.get('foo')); // >>> qaz

        // promise preserves current context for the caller
        promise.then(() => {
            console.log(ctx.get('foo')); // >>> qaz
            console.log(AsyncLocal.get('foo')); // >>> qaz
        });
    });

    // promise preserves current context for the caller
    promise.then(() => {
        console.log(ctx.get('foo')); // >>> bar
        console.log(AsyncLocal.get('foo')); // >>> bar
    });
});
```

## Binding context

There are some edge cases when context is not preserved in async flow. For such cases, it makes sense to bind context to the function or emitter explicitly.

```javascript
const EventEmitter = require('events');
const emitter = new EventEmitter();
AsyncLocal.bindEmitter(emitter);
```

```javascript
const origFn = () => {
    console.log(AsyncLocal.get('foo')); // >>> bar
};

AsyncLocal.run(() => {
    AsyncLocal.set('foo', 'bar');
    const fn = AsyncLocal.bind(origFn);

    fn();
})
```
