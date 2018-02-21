'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.assertIsPromise = assertIsPromise;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * PromiseChainErrorSummarizer can be used to collect and then summarize errors.
 *   It is designed to simplify debugging complex Promise chains
 *
 * @api public
 */
var PromiseChainErrorSummarizer = exports.PromiseChainErrorSummarizer = function () {
  function PromiseChainErrorSummarizer() {
    _classCallCheck(this, PromiseChainErrorSummarizer);

    this.results = [];
    this.catchError = this.catchError.bind(this);
  }

  /**
   * append another error
   */


  _createClass(PromiseChainErrorSummarizer, [{
    key: 'push',
    value: function push(result) {
      this.results.push(result);
    }
  }, {
    key: 'recordSuccess',
    value: function recordSuccess(name) {
      var _this = this;

      return function (value) {
        _this.push({ success: true, stepName: name, toString: function toString() {
            return JSON.stringify(value);
          } });
        return value;
      };
    }

    /**
     * catchError can be passed directly to a `catch` block to catch and push an error
     *
     *   Promise.reject(new Error('bad stuff'))
     *     .catch(yourErrorSummarizer.catchError)
     *
     * @param {Error} error
     * @api public
     */

  }, {
    key: 'catchError',
    value: function catchError(error) {
      this.push(error);
    }
  }, {
    key: 'nameError',
    value: function nameError(name) {
      return function nameError(error) {
        error.stepName = error.stepName || name;
        throw error;
      };
    }
  }, {
    key: 'handleFinalError',
    value: function handleFinalError(resultsObject) {
      var _this2 = this;

      return function (finalError) {
        _this2.push(finalError);
        throw _this2.reportError();
      };
    }

    /**
     * reportError returns a summary of all the errors that it has been notified of
     *
     * @return {Error}
     * @api public
     */

  }, {
    key: 'reportError',
    value: function reportError(errorFilters) {
      var _this3 = this;

      var errorMessage = 'The Really Determined Property Getter has failed.\n';
      this.results.forEach(function (oneError, index) {
        if (oneError.tag) {
          filter = _this3.errorFilters[oneError.tag];
          filter && filter(oneError);
        }
        var stepName = oneError.stepName;
        errorMessage += '  - ' + stepName + ' ';
        errorMessage += oneError.success ? 'resolved with ' + oneError.toString() : 'failed because ' + oneError.message;
        errorMessage += '\n';
      });
      return new Error(errorMessage);
    }
  }]);

  return PromiseChainErrorSummarizer;
}();

/**
 * assertIsPromise returns a Promise -- if the argument is a Promise, it is returned. Otherwise, a rejected Promise is returned explaining that the argument wasn't a Promise
 *
 * @param {Promise|any} maybeAPromise
 * @return {Promise}
 * @api public
 */


function assertIsPromise(maybeAPromise) {
  if (maybeAPromise && maybeAPromise.then) {
    return maybeAPromise.catch(function (error) {
      error.message = 'it was rejected with \'' + error.toString() + '\'';
      throw error;
    });
  } else {
    return Promise.reject(new Error('it was expected to return a Promise, but instead it returned ' + JSON.stringify(maybeAPromise)));
  }
}

/**
 * Quitter is a convenient way to keep track of whether a Promise chain should be aborted or not
 * 
 * @api public
 */

var Quitter = exports.Quitter = function () {
  function Quitter() {
    _classCallCheck(this, Quitter);
  }

  _createClass(Quitter, [{
    key: 'maybeQuit',

    /**
     * if `quit()` has been called, then throw the error. Otherwise, do nothing
     *
     * @param {Error} error
     * @api public
     */
    value: function maybeQuit(error) {
      if (this.doQuit) throw error;
    }

    /**
     * indicate that the next time `maybeQuit` is called, the quitter should quit (throw error) instead of doing nothing
     *   Returns a function which can be attached to a Promise catch block
     *
     * @return {Function} 
     * @api public
     */

  }, {
    key: 'quit',
    value: function quit() {
      var _this4 = this;

      return function (error) {
        _this4.doQuit = true;
        throw error;
      };
    }
  }, {
    key: 'quitOnCondition',
    value: function quitOnCondition(condition) {
      return condition ? this.quit() : function () {};
    }
  }]);

  return Quitter;
}();