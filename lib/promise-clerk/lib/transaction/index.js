'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ordinal = require('ordinal');

var _ordinal2 = _interopRequireDefault(_ordinal);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Transaction class provides a robust way to run a series of asynchronous functions in sequence
 *
 *    const transaction = new Transaction([
 *      () => doThingOne(),
 *      () => doThingTwo()
 *      () => doThingThree()
 *    ])
 *
 *    transaction.onSuccess(() => tellUserThatOperationSucceeded())
 *    transaction.onResume(() => showLoadingIndicator())
 *    transaction.onSpecificError('404', () => specialHandlingOf404Error())
 *    transaction.onSpecificError(/5\d\d/, () => specialHandlingOf5xxError())
 *    transaction.onError(error => {
 *      tellUserThatSomethingWentWrong(error.message)
 *        .then(userAnswer => {
 *          if(userAnswer === 'try again') {
 *            transaction.resume() // Repeats the failed step and continues with subsequent steps
 *          }
 *        })
 *    })
 *
 * @param {Array<Function>} steps
 * @api public
 */
var Transaction = function () {
  function Transaction(steps) {
    _classCallCheck(this, Transaction);

    if (!Array.isArray(steps)) {
      throw new Error('Expected a list of functions, got ' + JSON.stringify(steps));
    }
    if (steps.length <= 0) {
      throw new Error('A transaction needs at least one step');
    }
    steps.forEach(function (step, i) {
      if (typeof step !== 'function') {
        throw new Error((0, _ordinal2.default)(i + 1) + ' Transaction step is not a function');
      }
    });

    this.steps = steps;
    this.callbacks = {
      onSpecificErrors: []
    };
  }

  /**
   * execute starts executing the steps in order, waiting for the returned Promises to resolve before continuing to the next step
   *
   * @param {Object} context
   * @api public
   */


  _createClass(Transaction, [{
    key: 'execute',
    value: function execute() {
      var context = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (!this.callbacks.onError) {
        throw new Error('You called `execute` before assigning an `onError` callback. This means that errors in steps will be silenced. Add an `onError` callback before calling `execute`.');
      }
      if (this.currentStep >= 0) {
        throw new Error('Transaction is already in progress. To resume the transaction, use the `resume` method instead of `execute`');
      }
      this.context = context;
      this.runNextStep();
    }

    /**
     * onSuccess registers a callback which will be called when the last step completes successfully
     *
     * @param {Function} callback
     * @api public
     */

  }, {
    key: 'onSuccess',
    value: function onSuccess(callback) {
      this.callbacks.onSuccess = callback;
    }

    /**
     * onResume registers a callback which will be called each time the transaction is resumed
     *
     * @param {Function} callback
     * @api public
     */

  }, {
    key: 'onResume',
    value: function onResume(callback) {
      this.callbacks.onResume = callback;
    }

    /**
     * onError registers a callback which will be called when there is an error executing any step
     *
     * @param {Function} callback
     * @api public
     */

  }, {
    key: 'onError',
    value: function onError(callback) {
      this.callbacks.onError = callback;
    }

    /**
     * onSpecificError regiesters a callback which will be called when there is an error that matches the message
     *
     * @param {string|RegExp} error
     * @param {Function} callback
     * @api public
     */

  }, {
    key: 'onSpecificError',
    value: function onSpecificError(error, callback) {
      var pattern = error instanceof RegExp ? error : new RegExp('^' + error + '$');
      this.callbacks.onSpecificErrors.push({ callback: callback, pattern: pattern });
    }

    /**
     * resume continues execution starting with the current step
     *
     * @param {string} suppressWarning // use this in tests (**only in tests**) to suppress the synchronous resolve warning. It must be set to 'Yes this is in test code' to suppress the warning
     * @api public
     */

  }, {
    key: 'resume',
    value: function resume(suppressWarning) {
      if (this.resumedBeforeNextTick && suppressWarning !== 'Yes this is in test code') {
        var warning = 'You called `resolve` synchronously in an onError callback, which could produce an infinite loop. ' + 'You should probably get user input before resuming the transaction -- or if you intend to restart it automatically, you should implement that inside of the Transaction class as an auto-retry param. ' + 'If you do, only show this warning if auto-retry is not set to true.';
        console.warn(warning);
        throw new Error(warning);
      }
      this.callbacks.onResume && this.callbacks.onResume();
      this.currentStep -= 1;
      this.runNextStep();
    }

    /**
     * run the next step
     *
     * @api private
     */

  }, {
    key: 'runNextStep',
    value: function runNextStep() {
      var _this = this;

      var nextStep = this.getNextStep();
      if (!nextStep) {
        this.afterTransactionIsComplete();
      } else {
        var promise = nextStep(this.context);
        if (!promise || !promise.then) {
          this.handleStepError(new Error('it didn\'t return a Promise. Instead, it returned ' + JSON.stringify(promise)));
        } else {
          promise.then(function (newContext) {
            return _this.handleStepSuccess(newContext);
          }).catch(function (error) {
            return _this.handleStepError(error);
          });
        }
      }
    }

    /**
     * getNextStep increments the step counter and returns the next one
     *
     * @return {Function|undefined}
     * @api private
     */

  }, {
    key: 'getNextStep',
    value: function getNextStep() {
      this.currentStep = typeof this.currentStep !== 'number' ? 0 : this.currentStep + 1;
      return this.steps[this.currentStep];
    }

    /**
     * handleStepSuccess calls runNextStep after updating context
     *
     * @param {Object|undefined} newContext
     * @api private
     */

  }, {
    key: 'handleStepSuccess',
    value: function handleStepSuccess(newContext) {
      newContext = (typeof newContext === 'undefined' ? 'undefined' : _typeof(newContext)) === 'object' ? newContext : {};
      this.context = Object.assign({}, this.context, newContext);
      this.runNextStep();
    }

    /**
     * transaction is complete, cleanup
     *
     * @api private
     */

  }, {
    key: 'afterTransactionIsComplete',
    value: function afterTransactionIsComplete() {
      this.callbacks.onSuccess && this.callbacks.onSuccess();
    }

    /**
     * one transaction step failed: handle the error
     *
     * @param {Error} error
     * @api private
     */

  }, {
    key: 'handleStepError',
    value: function handleStepError(error) {
      var errorCallback = this.findErrorCallback(error.message);
      error.message = 'Error in ' + this.currentStepText() + ': ' + error.message;
      this.resumedBeforeNextTick = true;
      errorCallback(error);
      this.resumedBeforeNextTick = false;
    }

    /**
     * findErrorCallback returns a specific error callback if present, otherwise the onError callback
     *
     * @param {string} errorMessage
     * @return {Function}
     * @api private
     */

  }, {
    key: 'findErrorCallback',
    value: function findErrorCallback(errorMessage) {
      var errorCallbacks = [];
      this.callbacks.onSpecificErrors.forEach(function (_ref) {
        var callback = _ref.callback,
            pattern = _ref.pattern;

        if (errorMessage.match(pattern)) {
          errorCallbacks.push(callback);
        }
      });

      return errorCallbacks.length ? function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        return errorCallbacks.map(function (errorCallback) {
          return errorCallback.apply(undefined, args);
        });
      } : this.callbacks.onError;
    }

    /**
     * currentStepText returns a text representation of the current step
     *
     * @return {string}
     * @api private
     */

  }, {
    key: 'currentStepText',
    value: function currentStepText() {
      return this.currentStep >= this.steps.length ? 'onSuccess callback' : (0, _ordinal2.default)(this.currentStep + 1) + ' step';
    }
  }]);

  return Transaction;
}();

exports.default = Transaction;