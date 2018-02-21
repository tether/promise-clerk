'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utilities = require('./utilities');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * ReallyDeterminedPropertyGetter provides a way to define an external value (e.g. accessible via some API)
 *   with one or more secondary data sources to fall back to in case the primary one is unavailable
 *
 *    const movieListing = await new ReallyDeterminedPropertyGetter()
 *      .verify(movies => movies.length === movieTitles.length)
 *      .primarySource(() => mainAPI.getMovieListingsPromise(movieTitles))
 *      .secondarySource(() => Promise.all(movieTitles.map(title => otherAPI.getMovie(title))))
 *      .secondarySource(() => new Promise((resolve, reject) =>
 *        oldSchoolHttpGet('https://movies.com?titles=' + movieTitles,join(','), (err, results) => err ? reject(err) : resolve(results))
 *      ))
 *      .synchronizeWithPrimarySource(movies => mainAPI.updateMovieListings(movies))
 *      .ignoreSynchronizationErrors() // Only if you don't care whether mainApi.updateMovieListings() succeeds or fails
 *      .get()
 *
 *  The basic algorithm is:
 *    - if no `verify` method is provided, consider all values verified. Otherwise, a value is considered verified if the `verify` method returns true when provided the value
 *    - try getting the value from a primary source, return it if found and verified
 *    - try getting value from a secondary source, return it if found and verified
 *    - repeat until the value is found and verified or we're out of sources
 *
 *  Available methods are:
 *    - primarySource(getter: Function<Promise>)         // Required, may only be called once. Register a primary source
 *    - secondarySource(getter: Function<Promise>)       // Optional, may be called any number of times. Register a secondary source (will be attempted in the order added)
 *    - verify(verify: (value) => boolean)               // Optional, may only be called once. Will be called for each found value. Values for which `verify` returns false will be ignored
 *    - synchronizeWithPrimarySource((value) => Promise) // Optional, may be called any number of times. Registers a callback which is called if the primary source fails but a secondary source succeeds
 *    - ignoreSynchronizationErrors()                    // Optional. If it has been called, then any errors produced by a primarySourceSynchronizer function are ignored instead of causing the main `get` method to reject
 *    - get()                                            // Returns a Promise which resolves with the result, if available. May be called repeatedly as long as the returned Promise resolves before calling `get` again
 *
 * Note: this class uses the Builder Pattern (read more: https://en.wikipedia.org/wiki/Builder_pattern) to avoid having a long list of constructor arguments,
 *  some being optional, others required, etc..
 *
 */
var ReallyDeterminedPropertyGetter = function () {
  function ReallyDeterminedPropertyGetter() {
    _classCallCheck(this, ReallyDeterminedPropertyGetter);

    this.configuration = {
      secondarySources: [],
      primarySourceSynchronizers: []
    };
    this.getterState = {};
    this.verifyValue = this.verifyValue.bind(this);
  }

  /**
   * Register a primary source. Required, and may only be called once
   *
   * @param {Function} getter
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */


  _createClass(ReallyDeterminedPropertyGetter, [{
    key: 'primarySource',
    value: function primarySource(getter) {
      if (this.configuration.primarySource) throw new Error('There can only be one primary source. You already registered this primary source:\n' + this.configuration.primarySource.toString());
      this.configuration.primarySource = getter;
      return this;
    }

    /**
     * Register a secondary source. Optional, and may be called multiple times.
     *
     * @param {Function} getter
     * @return {ReallyDeterminedPropertyGetter}
     * @api public
     */

  }, {
    key: 'secondarySource',
    value: function secondarySource(getter) {
      this.configuration.secondarySources.push(getter);
      return this;
    }

    /**
     * Register a verification method to determine if a resolved value is acceptable
     *
     * @param {(value: any) => boolean} verifier
     * @return {ReallyDeterminedPropertyGetter}
     * @api public
     */

  }, {
    key: 'verify',
    value: function verify(verifier) {
      if (this.configuration.verifier) throw new Error('There can only be one verifier function. You already registered this verifier function:\n' + this.configuration.verifier.toString());
      this.configuration.verifier = verifier;
      return this;
    }

    /**
     * Register a primarySourceSynchronizer function which will be called if there is a data integrity problem to resolve
     *   - it is called if:
     *      1. the primary source fails (Promise rejects or value fails verification), AND
     *      2. one secondary source succeeded (Promise resolves and value passes verification)
     *
     * @param {(value: any) => Promise} primarySourceSynchronizer
     * @return {ReallyDeterminedPropertyGetter}
     * @api public
     */

  }, {
    key: 'synchronizeWithPrimarySource',
    value: function synchronizeWithPrimarySource(primarySourceSynchronizer) {
      this.configuration.primarySourceSynchronizers.push(primarySourceSynchronizer);
      return this;
    }

    /**
     * Sets a flag indicating that if a synchronization function fails, the main promise should not reject
     *
     * @return {ReallyDeterminedPropertyGetter}
     * @api public
     */

  }, {
    key: 'ignoreSynchronizationErrors',
    value: function ignoreSynchronizationErrors() {
      this.configuration.ignoreSynchronizationErrors = true;
      return this;
    }

    /**
     * Returns a Promise which will be resolved or rejected reflecting the result of all the sources
     *  - Tries the primary source followed by secondary sources in the order they were added
     *  - Calls all primarySourceSynchronizers with the successfully retrieved value
     *  - Resolves with the first successfully retrieved value
     *  - Rejects with the rejection messages of all sources if no sources' values were acceptable
     *
     * @return {any}
     * @api public
     */

  }, {
    key: 'get',
    value: function get() {
      var _this = this;

      if (this.getterState.inProgress) throw new Error('`get` was called again before the first call to `get` completed. This will produce unexpected behavior and is not allowed.');
      if (!this.configuration.primarySource) throw new Error('Cannot get value without a primary source. Use `.primarySource(() => primarySourcePromise)`');
      this.resetState();

      return (0, _utilities.assertIsPromise)(this.configuration.primarySource()).then(this.verifyValue).catch(this.getterState.results.nameError('primary source')).catch(function (primaryError) {
        var secondaryPromise = Promise.reject(primaryError);

        _this.configuration.secondarySources.forEach(function (secondarySource, index) {
          var name = 'secondary source #' + (index + 1);
          secondaryPromise = secondaryPromise.catch(function (secondaryError) {
            _this.getterState.quitter.maybeQuit(secondaryError);
            _this.getterState.results.push(secondaryError);
            var newPromise = (0, _utilities.assertIsPromise)(secondarySource(), 'secondarySource').then(_this.verifyValue).catch(_this.getterState.results.nameError(name)).then(_this.getterState.results.recordSuccess(name));

            _this.configuration.primarySourceSynchronizers.forEach(function (primarySourceSynchronizer, index) {
              var name = 'primarySourceSynchronizer function #' + (index + 1);
              newPromise = newPromise.then(function (value) {
                return Promise.resolve().then(function () {
                  return (0, _utilities.assertIsPromise)(primarySourceSynchronizer(value));
                }).catch(_this.getterState.results.nameError(name)).catch(_this.getterState.quitter.quitOnCondition(!_this.configuration.ignoreSynchronizationErrors)).then(function () {
                  return value;
                });
              });
            });

            return newPromise;
          });
        });
        return secondaryPromise;
      }).then(function (value) {
        _this.getterState.inProgress = false;return value;
      }).catch(function (error) {
        _this.getterState.inProgress = false;throw error;
      }).catch(this.getterState.results.handleFinalError());
    }

    /**
     * verifyValue throws if the value is not accepted by the `verifier`, otherwise it returns the value
     *  if `this.configuration.verifier(value)` returns truthy, the value is considered acceptable
     *  if there is no verifier function, the value is considered acceptable
     *
     * @param {any} value
     * @return {any}
     * @api private
     */

  }, {
    key: 'verifyValue',
    value: function verifyValue(value) {
      if (this.configuration.verifier && !this.configuration.verifier(value)) {
        throw new Error('the verifier function did not accept the value ' + JSON.stringify(value));
      } else {
        return value;
      }
    }

    /**
     * initialize/reset all state related to executing the `get` method
     *
     * @api private
     */

  }, {
    key: 'resetState',
    value: function resetState() {
      this.getterState = {
        quitter: new _utilities.Quitter(),
        inProgress: true,
        currentSecondarySource: 0,
        results: new _utilities.PromiseChainErrorSummarizer()
      };
    }
  }]);

  return ReallyDeterminedPropertyGetter;
}();

exports.default = ReallyDeterminedPropertyGetter;