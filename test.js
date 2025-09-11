const assert = require('assert');
const request = require('./DropinRequest');

describe('dropin-request', function() {
  this.timeout(10000); // Allow for network latency

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
      assert.strictEqual(typeof body, 'string');
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

  it('should handle form data', async function() {
    const body = await request.post({
      url: 'https://httpbin.org/post',
      form: { foo: 'bar', baz: 'qux' },
      json: true
    });
    assert.strictEqual(typeof body, 'object');
    assert.strictEqual(body.form.foo, 'bar');
    assert.strictEqual(body.form.baz, 'qux');
  });

  it('should return error for 404', function(done) {
    request.get('https://jsonplaceholder.typicode.com/404', function(err, res, body) {
      assert(err);
      assert.strictEqual(res.statusCode, 404);
      done();
    });
  });
});
