/**
 * Quitter is a convenient way to keep track of whether a Promise chain should be aborted or not
 *
 * @api public
 */
export default class Quitter {
  /**
   * if `quit()` has been called, then throw the error. Otherwise, do nothing
   *
   * @param {Error} error
   * @api public
   */
  maybeQuit (error) {
    if (this.doQuit) throw error
  }

  /**
   * indicate that the next time `maybeQuit` is called, the quitter should quit (throw error) instead of doing nothing
   *   Returns a function which can be attached to a Promise catch block
   *
   * @return {Function}
   * @api public
   */
  quit () {
    return (error) => {
      this.doQuit = true
      throw error
    }
  }

  quitOnCondition (condition) {
    return condition ? this.quit() : () => {}
  }
}
