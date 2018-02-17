/**
 * assertIsPromise returns a Promise -- if the argument is a Promise, it is returned. Otherwise, a rejected Promise is returned explaining that the argument wasn't a Promise
 *
 * @param {Promise|any} maybeAPromise
 * @return {Promise}
 * @api public
 */
export default function assertIsPromise (maybeAPromise) {
  if(maybeAPromise && maybeAPromise.then) {
    return maybeAPromise.catch(error => {
      error.message = `it was rejected with '${error.toString()}'`
      throw error
    })
  } else {
    return Promise.reject(new Error(`it was expected to return a Promise, but instead it returned ${JSON.stringify(maybeAPromise)}`))
  }
}


