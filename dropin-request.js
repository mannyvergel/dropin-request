/**
 * A modern, fetch-based drop-in replacement for the beloved 'request' and 'request-promise-native' libraries.
 * It mimics the familiar API and features, including callbacks, promises, and streaming/piping.
 *
 * @module dropin-request
 * @license MIT
 */

const { PassThrough, Readable } = require('stream');
const tough = require('tough-cookie');

/**
 * Translates request-style options into options compatible with the native fetch API.
 * @param {object} options - The request-style options.
 * @returns {object} An object with { url, ...fetchOptions }.
 */
async function translateOptions(options, jar) {
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

  // Handle jar option
  if (jar) {
    const cookieString = await jar.getCookieString(url);
    if (cookieString) {
      fetchOptions.headers['Cookie'] = cookieString;
    }
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
  constructor(options, jar) {
    super();
    this._options = options;
    this._jar = jar; // Store the jar for this request
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
  
  async _init() {
    try {
      const { url, ...fetchOptions } = await translateOptions(this._options, this._jar);
      const res = await fetch(url, fetchOptions);

      // JAR support
      if (this._jar) {
        const setCookieHeader = res.headers.get('set-cookie');
        if (setCookieHeader) {
          await this._jar.setCookie(setCookieHeader, url);
        }
      }
      
      this.emit('response', res);

      if (!res.ok) {
        const body = await consumeBody(res, this._options);
        const err = new Error(`HTTP Error: ${res.status} ${res.statusText}`);
        err.statusCode = res.status;
        err.response = res;
        err.error = body;
        err.options = this._options;
        throw err;
      }

      // If the status is OK, handle the success path.
      if (this._isPiped) {
        Readable.fromWeb(res.body).pipe(this);
        this._promiseResolver(res);
      } else {
        const body = await consumeBody(res, this._options);
        this._promiseResolver(body);
      }
    } catch (err) {
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
  // A persistent jar for this specific instance, created on-demand.
  let instanceJar = null;

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
    
    // JAR SUPPORT: Determine which jar to use for this request
    let activeJar = null;
    if (finalOptions.jar === true) {
      if (!instanceJar) {
        instanceJar = new tough.CookieJar();
      }
      activeJar = instanceJar;
    } else if (finalOptions.jar) {
      activeJar = finalOptions.jar;
    }

    if (typeof callback === 'function') {
      // Use an async IIFE to allow await within the callback pattern
      (async () => {
        let responseForCallback;
        try {
          const { url, ...fetchOptions } = await translateOptions(finalOptions, activeJar);
          const res = await fetch(url, fetchOptions);

          if (activeJar) {
            const setCookieHeader = res.headers.get('set-cookie');
            if (setCookieHeader) {
              await activeJar.setCookie(setCookieHeader, url);
            }
          }

          responseForCallback = {
            statusCode: res.status,
            headers: Object.fromEntries(res.headers.entries())
          };
          
          const body = await consumeBody(res, finalOptions);
          responseForCallback.body = body;

          if (!res.ok) {
            const err = new Error(`HTTP Error ${responseForCallback.statusCode}`);
            err.response = responseForCallback;
            callback(err, responseForCallback, body);
          } else {
            callback(null, responseForCallback, body);
          }
        } catch (err) {
          callback(err, responseForCallback || null, null);
        }
      })();
      return;
    }

    return new DropinRequest(finalOptions, activeJar);
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

  mainRequest.jar = () => {
    return new tough.CookieJar();
  };

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