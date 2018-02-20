# Promise Clerk for Fault Tolerance

A clerk is a white-collar worker who conducts general office tasks. The promise-clerk package conducts general Promise-related tasks to help with fault tolerance.

[![Build Status](https://travis-ci.org/tether/promise-clerk.svg?branch=master)](https://travis-ci.org/tether/promise-clerk)
[![NPM](https://img.shields.io/npm/v/promise-clerk.svg)](https://www.npmjs.com/package/promise-clerk)
[![Downloads](https://img.shields.io/npm/dm/promise-clerk.svg)](http://npm-stat.com/charts.html?package=promise-clerk)
[![guidelines](https://tether.github.io/contribution-guide/badge-guidelines.svg)](https://github.com/tether/contribution-guide)

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

  - [Installing](#installing)
  - [Overview](#overview)
    - [`PromiseChainErrorCatcher`](#promisechainerrorcatcher)
    - [`assertIsPromise`](#assertispromise)
    - [`Quitter`](#quitter)
    - [`ReallyDeterminedPropertyGetter`](#reallydeterminedpropertygetter)
    - [`Transaction`](#transaction)
- [Contributing](#contributing)
  - [Testing](#testing)
  - [Style Guide](#style-guide)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

### Installing

```shell
git submodule add https://github.com/tether/promise-clerk.git lib/promise-clerk
```

Once we deploy it to npm, you can run
```shell
npm install --save promise-clerk
```

### Overview
* `PromiseChainErrorCatcher`: catch and log errors (with context) in a Promise chain 
* `assertIsPromise`: converts non-promise objects into rejected Promises, returns Promise objects as-is
* `Quitter`: convenient way to break a Promise chain, especially when the chain was constructed with a loop
* `ReallyDeterminedPropertyGetter`: if you can't trust a data source, provide one or more fallbacks
* `Transaction`: Resume multi-step operations at the failed step

#### `PromiseChainErrorCatcher`
PromiseChainErrorCatcher can be used to collect and then summarize errors.
It is designed to simplify debugging complex Promise chains

```js
  import { PromiseChainErrorCatcher } from 'promise-clerk'
  const errorCatcher = new PromiseChainErrorCatcher('Your Module')

  const promiseUnderTest = riskyFooBar()
    .catch(errorCatcher.nameError('Foo Bar step'))
    .catch(error => {
      errorCatcher.push(error)
      return riskyQuux()
        .then(errorCatcher.recordSuccess('Quux step'))
        .catch(errorCatcher.nameError('Quux step'))
    })  
    .then(value => {
      return doNotCareIfThisFailsOrSucceeds()
        .catch(errorCatcher.nameError('Unimportant step'))
        .catch(errorCatcher.catchError)
        .then(() => doSomethingThatFails())
        .catch(errorCatcher.nameError('Failing step'))
    })  
    .catch(errorCatcher.handleFinalError())
```
This will reject with:

```txt
Your Module has failed.
  - Foo Bar step failed because <error message from riskyFooBar>
  - Quux step resolved with "value from riskyQuux"
  - Unimportant step failed because <error message from doNotCareIfThisFailsOrSucceeds>
  - Failing step failed because <error message from doSomethingThatFails>
```

Note: this was recently extracted from the ReallyDeterminedPropertyGetter and may not be fully generalized yet. 

#### `assertIsPromise`
```js
  import { assertIsPromise } from 'promise-clerk'

  assertIsPromise(probablyReturnsPromise())
    .then(doSuffAfterPromise())

```
assertIsPromise always returns a Promise. If it was not given a Promise, it returns a rejected Promise, otherwise it returns the original Promise. It considers the argument a Promise if it's truthy and has a truthy property named `then`. 

Note, this was recently extracted from ReallyDeterminedPropertyGetter and PromiseChainErrorCatcher, and may not be fully generalized yet.

#### `Quitter`
Quitter is a convenient way to break a Promise chain, especially when the chain was constructed with a loop

```js
  import { Quitter } from 'promise-clerk'

  const quitter = new Quitter()

  const promise = Promise.resolve()

  listOfEndpoints.forEach(endpoint => {
    promise.then(value => {
      quitter.maybeQuit(new Error('not continuing'))
      return endpoint.getData()
        .then(data => {
          quitter.quitOnCondition(data.isReallyBad)
          return data
        })
    })
  })
```

In this example, for each endpoint in the list, you `getData` -- but if any endpoint returns data that ` { isReallyBad: true }`, then you don't fetch the data from any more endpoints.
You could also use the `quit` method instead of `quitOnCondition` if there is no condition.

#### `ReallyDeterminedPropertyGetter`
ReallyDeterminedPropertyGetter provides a way to define an external value (e.g. accessible via some API)
  with one or more secondary data sources to fall back to in case the primary one is unavailable

```js
  import { ReallyDeterminedPropertyGetter } from 'promise-clerk' 
  const movieListing = await new ReallyDeterminedPropertyGetter()
    .verify(movies => movies.length === movieTitles.length)
    .primarySource(() => mainAPI.getMovieListingsPromise(movieTitles))
    .secondarySource(() => Promise.all(movieTitles.map(title => otherAPI.getMovie(title))))
    .secondarySource(() => new Promise((resolve, reject) =>
      oldSchoolHttpGet('https://movies.com?titles=' + movieTitles,join(','), (err, results) => err ? reject(err) : resolve(results))
    ))
    .synchronizeWithPrimarySource(movies => mainAPI.updateMovieListings(movies))
    .ignoreSynchronizationErrors() // Only if you don't care whether mainApi.updateMovieListings() succeeds or fails
    .get()
```

 The basic algorithm is:

 - if no `verify` method is provided, consider all values verified. Otherwise, a value is considered verified if the `verify` method returns true when provided the value
 - try getting the value from a primary source, return it if found and verified
 - try getting value from a secondary source, return it if found and verified
 - repeat until the value is found and verified or we're out of sources

 Available methods are:

 - `primarySource(getter: Function<Promise>)`         // Required, may only be called once. Register a primary source
 - `secondarySource(getter: Function<Promise>)`       // Optional, may be called any number of times. Register a secondary source (will be attempted in the order added)
 - `verify(verify: (value) => boolean)`               // Optional, may only be called once. Will be called for each found value. Values for which `verify` returns false will be ignored
 - `synchronizeWithPrimarySource((value) => Promise)` // Optional, may be called any number of times. Registers a callback which is called if the primary source fails but a secondary source succeeds
 - `ignoreSynchronizationErrors()`                    // Optional. If it has been called, then any errors produced by a primarySourceSynchronizer function are ignored instead of causing the main `get` method to reject
 - `get()`                                            // Returns a Promise which resolves with the result, if available. May be called repeatedly as long as the returned Promise resolves before calling `get` again

Note: this class uses the Builder Pattern (read more: https://en.wikipedia.org/wiki/Builder_pattern) to avoid having a long list of constructor arguments,
 some being optional, others required, etc..

#### `Transaction`

Transaction class provides a robust way to run a series of asynchronous functions in sequence

```js
  import { Transaction } from 'promise-clerk'
  const transaction = new Transaction([
    () => doThingOne(),
    () => doThingTwo()
    () => doThingThree()
  ]).then(() => tellUserThatOperationSucceeded())

  transaction.onResume(() => showLoadingIndicator())
  transaction.onSpecificError('404', () => specialHandlingOf404Error())
  transaction.onSpecificError(/5\d\d/, () => specialHandlingOf5xxError())
  transaction.onError(error => {
    tellUserThatSomethingWentWrong(error.message)
      .then(userAnswer => {
        if(userAnswer === 'try again') {
          transaction.resume() // Repeats the failed step and continues with subsequent steps
        }
      })
  })
```


## Contributing
Need inspiration for naming or design? Consider [Netflix's Hystrix fault-tolerance library](https://github.com/Netflix/Hystrix/)

### Testing
- Each utility should have a unit test named `utility-name.test.js` in the test folder.

### Style Guide
- We use [Standard JS](https://standardjs.com/) -- please run `npm run standard` and deal with any issues before committing.

## Question

For support, bug reports and or feature requests please make sure to read our
<a href="https://github.com/tether/contribution-guide/blob/master/community.md" target="_blank">community guidelines</a> and use the issue list of this repo and make sure it's not present yet in our reporting checklist.

## Contribution

The open source community is very important to us. If you want to participate to this repository, please make sure to read our <a href="https://github.com/tether/contribution-guide" target="_blank">guidelines</a> before making any pull request. If you have any related project, please let everyone know in our wiki.:1


## License
The MIT License (MIT)

Copyright (c) 2018 Petrofeed Inc

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
