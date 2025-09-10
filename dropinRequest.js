// DropinRequest.js
// Drop-in replacement for 'request' and 'request-promise-native'
// Supports callback and promise usage

// Drop-in replacement for 'request' and 'request-promise-native' using native fetch (only tested with Node.js v20+)
function dropinRequest(uri, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};
    let url = uri;
    if (typeof uri === 'object') {
        options = { ...uri };
        url = options.url || options.uri;
    }
    const fetchOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        // credentials, etc. can be added if needed
    };
    // Remove undefined body for GET/HEAD
    if ((fetchOptions.method === 'GET' || fetchOptions.method === 'HEAD') && fetchOptions.body === undefined) {
        delete fetchOptions.body;
    }
    const doFetch = async () => {
        try {
            const res = await fetch(url, fetchOptions);
            const contentType = res.headers.get('content-type') || '';
            let body;
            let isJson = false;
            if (options.json || contentType.includes('application/json')) {
                try {
                    body = await res.json();
                    isJson = true;
                } catch (e) {
                    // fallback to text if JSON parse fails
                    body = await res.text();
                }
            } else {
                body = await res.text();
            }
            // Mimic request's response object
            res.body = body;
            if (callback) {
                callback(null, res, body);
            }
            return body;
        } catch (err) {
            if (callback) {
                callback(err);
            }
            throw err;
        }
    };
    // Always return a promise
    return doFetch();
}

// request-promise-native compatibility
dropinRequest.defaults = () => dropinRequest;
dropinRequest.get = (uri, options, cb) => dropinRequest(uri, { ...options, method: 'GET' }, cb);
dropinRequest.post = (uri, options, cb) => dropinRequest(uri, { ...options, method: 'POST' }, cb);
dropinRequest.put = (uri, options, cb) => dropinRequest(uri, { ...options, method: 'PUT' }, cb);
dropinRequest.delete = (uri, options, cb) => dropinRequest(uri, { ...options, method: 'DELETE' }, cb);

module.exports = dropinRequest;
