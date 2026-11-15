// Defense in depth for Node test/build processes, including inherited child processes.
// Browser traffic is separately guarded by Playwright routes and a dead local proxy.
const net = require("node:net");
const local = host => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof options === "object" && options !== null) {
    if (!options.path && !local(options.host || options.hostname || "localhost")) throw new Error("Offline validation blocked a non-loopback connection");
  } else if (typeof options === "number" && typeof args[1] === "string" && !local(args[1])) {
    throw new Error("Offline validation blocked a non-loopback connection");
  }
  return connect.apply(this, args);
};
const fetchLocal = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) return Promise.reject(new Error("Offline validation blocked an unmocked fetch"));
  return fetchLocal(input, init);
};
