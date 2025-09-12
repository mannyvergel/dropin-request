const assert = require('assert');
const request = require('../'); // Assuming the library is in the parent directory
const fs = require('fs');
const path = require('path');

describe('dropin-request', function() {
  this.timeout(10000); // Allow for network latency

  // --- Original Tests (Verified) ---

  it('should GET JSON and parse automatically', async function() {
    const body = await request.get({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      json: true
    });
    assert.strictEqual(typeof body, 'object');
    assert.strictEqual(body.id, 1);
  });

  it('should POST JSON and receive JSON response', async function() {
    const body = await request.post({
      url: 'https://jsonplaceholder.typicode.com/posts',
      json: true,
      body: { title: 'foo', body: 'bar', userId: 1 }
    });
    assert.strictEqual(typeof body, 'object');
    assert.strictEqual(body.id, 101);
  });

  it('should support callback style', function(done) {
    request.get('https://jsonplaceholder.typicode.com/posts/1', function(err, res, body) {
      assert.ifError(err);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(typeof body, 'string'); // Correct, body is string without json:true
      assert.strictEqual(JSON.parse(body).id, 1);
      done();
    });
  });

  it('should support direct request(url, callback) usage', function(done) {
    request('https://jsonplaceholder.typicode.com/posts/1', function(err, res, body) {
      assert.ifError(err);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(typeof body, 'string');
      assert(body.includes('userId'));
      done();
    });
  });

  it('should handle form parameter', async function() {
    const body = await request.post({
      url: 'https://httpbin.org/post',
      form: { foo: 'bar', baz: 'qux' },
      json: true // To parse httpbin's response
    });
    assert.strictEqual(typeof body, 'object');
    assert.strictEqual(body.form.foo, 'bar');
    assert.strictEqual(body.form.baz, 'qux');
  });

  it('should return error for 404 in callback mode', function(done) {  
    request.get('https://jsonplaceholder.typicode.com/posts/999999', function(err, res, body) {  
      assert(err);
      assert.strictEqual(res.statusCode, 404);
      done();
    });
  });

  it('should pipe response to a writable stream', function(done) {
    const filePath = path.join(__dirname, 'output.txt');
    const writable = fs.createWriteStream(filePath);
    const req = request('https://jsonplaceholder.typicode.com/posts/1');
    
    req.pipe(writable);

    req.on('error', done); // Pass stream errors to mocha

    writable.on('finish', function() {
      const content = fs.readFileSync(filePath, 'utf8');
      assert(content.includes('userId'));
      fs.unlinkSync(filePath); // Clean up
      done();
    });
  });

  // --- New, Crucial Tests ---

  it('should reject promise for a 404 error', async function() {
    try {
      await request.get({ url: 'https://httpbin.org/status/404', json: true });
      // This line should not be reached
      assert.fail('The promise should have been rejected');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
      assert(err.message.includes('HTTP Error: 404 NOT FOUND'));
      // Check for the enhanced error body you added
      assert.strictEqual(err.error, ''); 
    }
  });

  it('should time out if request takes too long', async function() {
    // httpbin's delay endpoint is perfect for this
    await assert.rejects(
      request.get({ url: 'https://httpbin.org/delay/5', timeout: 1000 }),
      { name: 'AbortError' },
      'Request should have been aborted due to timeout'
    );
  });

  it('should handle basic authentication', async function() {
    const body = await request.get({
      url: 'https://httpbin.org/basic-auth/testuser/testpass',
      auth: { user: 'testuser', pass: 'testpass' },
      json: true
    });
    assert.strictEqual(body.authenticated, true);
    assert.strictEqual(body.user, 'testuser');
  });

  it('should handle querystrings with the qs option', async function() {
    const body = await request.get({
      url: 'https://httpbin.org/get',
      qs: { a: 1, b: 'hello world' },
      json: true
    });
    assert.strictEqual(body.args.a, '1');
    assert.strictEqual(body.args.b, 'hello world');
  });

  it('should send custom headers', async function() {
    const body = await request.get({
      url: 'https://httpbin.org/headers',
      headers: { 'X-Custom-Header': 'MyValue' },
      json: true
    });
    assert.strictEqual(body.headers['X-Custom-Header'], 'MyValue');
  });

  it('should return a Buffer for binary data when encoding is null', async function() {
    const body = await request.get({
      url: 'https://httpbin.org/image/png',
      encoding: null
    });
    assert(body instanceof Buffer, 'Response body should be a Buffer');
    // A simple check for the PNG file signature (magic number)
    assert.strictEqual(body.toString('hex', 0, 8), '89504e470d0a1a0a');
  });

  it('should use options from .defaults()', async function() {
    const customRequest = request.defaults({
      headers: { 'X-Default-Header': 'DefaultValue' }
    });
    const body = await customRequest.get({
      url: 'https://httpbin.org/headers',
      json: true
    });
    assert.strictEqual(body.headers['X-Default-Header'], 'DefaultValue');
  });

});