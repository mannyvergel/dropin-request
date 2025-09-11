// dropinRequest.js (drop-in replacement for request / request-promise-native)
class DropinRequest {
  constructor(defaultOptions = {}) {
    this.defaults = defaultOptions;
  }

  async _fetchWrapper(options) {
    options = this._normalizeOptions(options);
    let url = options.url || options.uri;
    if (!url) throw new Error("URL is required");

    // Handle qs (query string) option
    if (options.qs && typeof options.qs === 'object') {
      const qs = new URLSearchParams(options.qs).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }

    // Merge headers: defaults.headers < options.headers
    const headers = { ...(this.defaults.headers || {}), ...(options.headers || {}) };

    let body = undefined;
    if (options.form) {
      body = new URLSearchParams(options.form);
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (options.json && options.body && typeof options.body === 'object') {
      body = JSON.stringify(options.body);
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (options.body !== undefined) {
      body = options.body;
    }

    const fetchOptions = {
      method: options.method || this.defaults.method || "GET",
      headers,
      body,
      // ...other fetch options from defaults
      ...this.defaults,
    };
    // Remove headers from defaults to avoid duplication
    delete fetchOptions.headers;

    const res = await fetch(url, fetchOptions);

    const contentType = res.headers.get("content-type") || "";
    let parsedBody = "";
    try {
      if (options.json) {
        parsedBody = await res.json();
      } else {
        parsedBody = await res.text();
      }
    } catch (e) {
      console.error("Error parsing body:", e);
    }

    const response = {
      statusCode: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      url: res.url,
      body: parsedBody,
    };

    // Error handling for non-2xx status
    if (!res.ok) {
      return { error: new Error(`Request failed with status ${res.status}`), response, body: parsedBody };
    }

    return { error: null, response, body: parsedBody };
  }

  request(options, callback) {
    const exec = this._fetchWrapper(options);

    if (typeof callback === "function") {
      exec.then(({ error, response, body }) => callback(error, response, body))
          .catch((err) => callback(err, null, null));
      return;
    }

    // Promise style
    return exec.then(({ body }) => body);
  }

  _normalizeOptions(options) {
    return typeof options === "string" ? { url: options } : options;
  }

  get(options, callback) {
    options = this._normalizeOptions(options);
    options.method = "GET";
    return this.request(options, callback);
  }

  post(options, callback) {
    options = this._normalizeOptions(options);
    options.method = "POST";
    return this.request(options, callback);
  }

  put(options, callback) {
    options = this._normalizeOptions(options);
    options.method = "PUT";
    return this.request(options, callback);
  }

  delete(options, callback) {
    options = this._normalizeOptions(options);
    options.method = "DELETE";
    return this.request(options, callback);
  }

  static defaults(defaultOptions) {
    return new DropinRequest(defaultOptions);
  }
}

// export as a callable function, like the original request
function createRequest(defaults = {}) {
  const req = new DropinRequest(defaults);
  const bound = req.request.bind(req);

  // attach methods
  bound.get = req.get.bind(req);
  bound.post = req.post.bind(req);
  bound.put = req.put.bind(req);
  bound.delete = req.delete.bind(req);
  bound.defaults = DropinRequest.defaults;

  return bound;
}

module.exports = createRequest();
