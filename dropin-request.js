/**
 * A modern, fetch-based drop-in replacement for the beloved 'request' and 'request-promise-native' libraries.
 * It mimics the familiar API and features, including callbacks, promises, and streaming/piping.
 *
 * @module dropin-request
 * @license MIT
 */

const { PassThrough, Readable } = require('stream');

/**
 * Translates request-style options into options compatible with the native fetch API.
 * @param {object} options - The request-style options.
 * @returns {object} An object with { url, ...fetchOptions }.
 */
function translateOptions(options) {
  const fetchOptions = {
    method: (options.method || 'GET').toUpperCase(),
    headers: { ...(options.headers || {}) },
  };

  if (options.timeout) {
    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    setTimeout(() => controller.abort(), options.timeout);
  }

  let url = options.url || options.uri;
  if (!url) {
    throw new Error('URL is required.');
  }

  if (options.auth) {
    const { user, pass } = options.auth;
    const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
    fetchOptions.headers['Authorization'] = `Basic ${encoded}`;
  }

  // Handle JSON body
  if (options.json && options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
    fetchOptions.headers['Content-Type'] = 'application/json';
    if (!fetchOptions.headers['Accept']) {
      fetchOptions.headers['Accept'] = 'application/json';
    }
  }
  // Handle form data
  else if (options.form) {
    fetchOptions.body = new URLSearchParams(options.form).toString();
    fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  else if (options.body) {
    fetchOptions.body = options.body;
  }

  // Handle querystring
  if (options.qs) {
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(options.qs)) {
      urlObj.searchParams.append(key, value);
    }
    url = urlObj.toString();
  }

  return { url, ...fetchOptions };
}

/**
 * Consumes the body of a fetch response based on options.
 * @param {Response} res - The fetch Response object.
 * @param {object} options - The request options.
 * @returns {Promise<string|object|Buffer>} A promise that resolves with the parsed body.
 */
async function consumeBody(res, options) {
  if (options.encoding === null) {
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (options.json) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }
  return res.text();
}

/**
 * A custom class that acts as both a Stream and a Thenable (Promise-like).
 * It manages the fetch lifecycle, deciding whether to stream or buffer the response.
 */
class DropinRequest extends PassThrough {
  constructor(options) {
    super();
    this._options = options;
    this._isPiped = false;

    this._promise = new Promise((resolve, reject) => {
      this._promiseResolver = resolve;
      this._promiseRejector = reject;
    });

    process.nextTick(() => this._init());
  }

  pipe(destination, options) {
    this._isPiped = true;
    return super.pipe(destination, options);
  }

  then(onFulfilled, onRejected) {
    return this._promise.then(onFulfilled, onRejected);
  }

  catch (onRejected) {
    return this._promise.catch(onRejected);
  }

  finally(onFinally) {
    return this._promise.finally(onFinally);
  }
  
  _init() {
    try {
      const { url, ...fetchOptions } = translateOptions(this._options);

      fetch(url, fetchOptions)
        .then(res => {
          this.emit('response', res);
          // If the status is a 4xx or 5xx, we treat it as an error.
          if (!res.ok) {
            // Consume the body, create a rich error, and throw it to trigger the .catch() block.
            return consumeBody(res, this._options).then(body => {
              const err = new Error(`HTTP Error: ${res.status} ${res.statusText}`);
              err.statusCode = res.status;
              err.response = res;
              err.error = body;
              err.options = this._options;
              throw err;
            });
          }

          // If the status is OK, handle the success path.
          if (this._isPiped) {
            Readable.fromWeb(res.body).pipe(this);
            return res;
          } else {
            return consumeBody(res, this._options);
          }
        })
        .then(bodyOrResponse => {
          this._promiseResolver(bodyOrResponse);
        })
        .catch(err => {
          // This is the SINGLE failure handler. It catches network errors and thrown HTTP errors.
          this._promiseRejector(err);
          this.emit('error', err);
        });
    } catch (err) {
      // This handles synchronous errors.
      this._promiseRejector(err);
      this.emit('error', err);
    }
  }
}

/**
 * Factory function to create a new request instance with optional default options.
 * @param {object} defaultOptions - Options to apply to all requests made with this instance.
 * @returns {Function} A request function instance.
 */
function createRequestInstance(defaultOptions = {}) {
  const mainRequest = function(uri, options, callback) {
    let opts = {};
    if (typeof uri === 'object' && uri !== null) {
      opts = { ...uri };
    } else if (typeof uri === 'string') {
      opts.url = uri;
    }

    if (typeof options === 'function') {
      callback = options;
    } else if (typeof options === 'object' && options !== null) {
      opts = { ...opts, ...options };
    }

    const finalOptions = { ...defaultOptions, ...opts };

    if (typeof callback === 'function') {
      let responseForCallback;
      try {
           const { url, ...fetchOptions } = translateOptions(finalOptions);

           fetch(url, fetchOptions)
              .then(res => {
                responseForCallback = {
                  statusCode: res.status,
                  headers: Object.fromEntries(res.headers.entries())
                };
                return consumeBody(res, finalOptions);
              })
              .then(body => {
                responseForCallback.body = body;
                if (responseForCallback.statusCode >= 400) {
                  const err = new Error(`HTTP Error ${responseForCallback.statusCode}`);
                  err.response = responseForCallback;
                  callback(err, responseForCallback, body);
                } else {
                  callback(null, responseForCallback, body);
                }
              })
              .catch(err => {
                callback(err, responseForCallback || null, null);
              });
      } catch (err) {
        callback(err, null, null);
      }
     
      return;
    }

    return new DropinRequest(finalOptions);
  };

  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
  methods.forEach(method => {
    mainRequest[method] = function(uri, options, callback) {
      let opts = {};
      if (typeof uri === 'object' && uri !== null) {
        opts = { ...uri };
      } else if (typeof uri === 'string') {
        opts.url = uri;
      } else {
        opts = {};
      }

      if (typeof options === 'function') {
        callback = options;
      } else if (typeof options === 'object' && options !== null) {
        opts = { ...opts, ...options };
      }

      opts.method = method.toUpperCase();
      return mainRequest(opts, callback);
    };
  });

  mainRequest.defaults = (newDefaults) => {
    const currentDefaults = JSON.parse(JSON.stringify(defaultOptions));
    const mergedDefaults = { ...currentDefaults, ...newDefaults };

    if (currentDefaults.headers && newDefaults.headers) {
      mergedDefaults.headers = { ...currentDefaults.headers, ...newDefaults.headers };
    }
    return createRequestInstance(mergedDefaults);
  };

  return mainRequest;
}

module.exports = createRequestInstance();