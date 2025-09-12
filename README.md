# dropin-request

⚡ A modern drop-in replacement for the deprecated [`request`](https://www.npmjs.com/package/request) and [`request-promise-native`](https://www.npmjs.com/package/request-promise-native) libraries — powered by Node.js native [`fetch`](https://nodejs.org/api/globals.html#fetch).

[![npm version](https://img.shields.io/npm/v/dropin-request.svg)](https://www.npmjs.com/package/dropin-request)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/dropin-request)](https://nodejs.org/)

---

## ✨ Why this exists

If you're like me and have been using Node.js since the early days, you probably have massive codebases that rely heavily on [`request`](https://www.npmjs.com/package/request) and later [`request-promise-native`](https://www.npmjs.com/package/request-promise-native).  

Now that both libraries are deprecated, the “official” solution is to migrate everything to native `fetch`. But realistically, **rewriting every single line of code is painful**.  

That’s why **`dropin-request`** exists — just replace your `require("request")` (or `require("request-promise-native")`) with:  

```js
const request = require("dropin-request");
```

…and your code keeps working, powered by modern `fetch` under the hood 🚀.

---

## ✨ Features

* ✅ Drop-in replacement for `request` and `request-promise-native`
* ✅ Supports both **callback** and **Promise/async** usage
* ✅ Uses Node.js **native fetch** (no extra dependencies)
* ✅ Simple, lightweight, and future-proof
* ✅ Works with `request(url, callback)` or `await request(url)`

---

## 📦 Installation

```bash
npm install dropin-request
```

Requires **Node.js >= 18.17.0** (first LTS with stable `fetch`).

---

## 🚀 Usage

### Callback style (like `request`)

```js
const request = require("dropin-request");

request("https://jsonplaceholder.typicode.com/posts/1", (err, res, body) => {
  if (err) throw err;
  console.log("Status:", res.statusCode);
  console.log("Body:", body);
});
```

### Promise / async style (like `request-promise-native`)

```js
const request = require("dropin-request");

(async () => {
  try {
    const body = await request("https://jsonplaceholder.typicode.com/posts/1", { json: true });
    console.log("Async Body:", body);
  } catch (err) {
    console.error("Error:", err);
  }
})();
```

### Explicit HTTP methods

```js
request.get("https://jsonplaceholder.typicode.com/posts/1", (err, res, body) => {
  console.log(body);
});

await request.post({
  url: "https://jsonplaceholder.typicode.com/posts",
  json: true,
  body: { title: "Hello", body: "World", userId: 1 }
});
```

### Defaults

```js
const r2 = request.defaults({ headers: { "X-Test": "yes" } });

r2("https://jsonplaceholder.typicode.com/posts/1", (err, res, body) => {
  console.log(body);
});
```

---

## 🔄 Migration Guide

| Old `request` code                                   | New `dropin-request` code                    |
| ---------------------------------------------------- | -------------------------------------------- |
| `const request = require("request");`                | `const request = require("dropin-request");` |
| `request(url, cb)`                                   | `request(url, cb)` (same)                    |
| `request.get(url, cb)`                               | `request.get(url, cb)` (same)                |
| `request.post(opts, cb)`                             | `request.post(opts, cb)` (same)              |
| `await request(url)` (with `request-promise-native`) | `await request(url)` (same)                  |

Minimal to no code changes required 🚀

---

## ⚠️ Limitations & Contributions

This project is **not a 100% comprehensive replacement** for every feature of the original `request` library (e.g. multi-part and other advanced options). It covers the most common use cases and aims to make migration as painless as possible.

If you find missing features or want to enhance compatibility, **contributions are very welcome!**
Feel free to open an issue or submit a pull request on [GitHub](https://github.com/mannyvergel/dropin-request).

---

## ⚖️ License

MIT © 2025 [Manuel Vergel](https://github.com/mannyvergel)
