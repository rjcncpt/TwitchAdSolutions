const vm = require('node:vm');

const browser = String.raw`
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.location = { href: 'https://www.twitch.tv/test', hostname: 'www.twitch.tv' };
globalThis.document = {
    location,
    readyState: 'loading',
    addEventListener() {},
    getElementsByTagName() { return []; },
    querySelector() { return null; }
};
globalThis.navigator = { userAgent: 'Fixture' };
globalThis.console = { log() {}, error() {}, warn() {} };

const inputRoutes = new Map();
const requests = [];
const capturedWorkers = [];
const workerMessages = [];
const timers = new Map();
const objectUrls = new Map();
const revoked = [];
let nextTimerId = 0;
let nextBlobId = 0;
let now = 20_000_000;
Date.now = () => now;

globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, time: now + delay, delay });
    return id;
};
globalThis.clearTimeout = id => timers.delete(id);
function advance(milliseconds) {
    const until = now + milliseconds;
    for (;;) {
        const due = [...timers].filter(([, timer]) => timer.time <= until)
            .sort((first, second) => first[1].time - second[1].time)[0];
        if (!due) {
            now = until;
            return;
        }
        const [id, { callback, time }] = due;
        timers.delete(id);
        now = time;
        callback();
    }
}

class FakeHeaders {
    constructor(initial = {}) {
        const entries = initial instanceof FakeHeaders ? initial.entries()
            : Array.isArray(initial) ? initial : Object.entries(initial);
        this.values = new Map();
        for (const [name, value] of entries) {
            this.values.set(String(name).toLowerCase(), String(value));
        }
    }
    get(name) { return this.values.get(name.toLowerCase()) ?? null; }
    has(name) { return this.get(name) !== null; }
    set(name, value) { this.values.set(name.toLowerCase(), String(value)); }
    delete(name) { this.values.delete(name.toLowerCase()); }
    entries() { return this.values.entries(); }
    [Symbol.iterator]() { return this.entries(); }
}

class FakeResponse {
    constructor(body, init = {}) {
        this.body = String(body);
        this.status = init.status ?? 200;
        this.statusText = init.statusText ?? '';
        this.headers = new FakeHeaders(init.headers);
        this.url = init.url ?? '';
        this.redirected = !!init.redirected;
        this.type = init.type ?? 'default';
        this.bodyUsed = false;
        this.readError = init.readError;
    }
    clone() {
        if (this.bodyUsed) throw new TypeError('Response body already read');
        return new FakeResponse(this.body, this);
    }
    async text() {
        if (this.bodyUsed) throw new TypeError('Response body already read');
        this.bodyUsed = true;
        if (this.readError) throw new Error(this.readError);
        return this.body;
    }
    async json() { return JSON.parse(await this.text()); }
    async blob() { return new Blob([await this.text()]); }
}

class FakeRequest {
    constructor(input, init = {}) {
        this.url = new URL(input instanceof FakeRequest ? input.url : input, location.href).href;
        this.headers = new FakeHeaders(init.headers ?? input?.headers);
        this.method = init.method ?? input?.method ?? 'GET';
        this.body = init.body ?? input?.body ?? null;
        this.bodyUsed = false;
    }
    clone() {
        if (this.bodyUsed) throw new TypeError('Request body already read');
        return new FakeRequest(this);
    }
    async text() {
        if (this.bodyUsed) throw new TypeError('Request body already read');
        this.bodyUsed = true;
        return this.body ?? '';
    }
}
class FakeBlob {
    constructor(parts) { this.text = parts.join(''); }
}

globalThis.Headers = FakeHeaders;
globalThis.Request = FakeRequest;
globalThis.Response = FakeResponse;
globalThis.Blob = FakeBlob;
globalThis.URL = class extends URL {
    static createObjectURL(blob) {
        const url = 'blob:https://www.twitch.tv/fixture-' + ++nextBlobId;
        objectUrls.set(url, blob.text);
        return url;
    }
    static revokeObjectURL(url) {
        if (objectUrls.delete(url)) revoked.push(url);
    }
};

const workerListeners = new Map();
function addEventListener(name, listener) {
    let listeners = workerListeners.get(name);
    if (!listeners) workerListeners.set(name, listeners = []);
    listeners.push(listener);
}
function dispatch(name, data) {
    for (const listener of workerListeners.get(name) ?? []) listener({data});
}
let graphQLResponse = null;
globalThis.postMessage = message => {
    workerMessages.push(message);
    if (message.key === 'FetchRequest' && graphQLResponse) {
        const response = { ...graphQLResponse, id: message.value.id };
        Promise.resolve().then(() => dispatch('message', {key: 'FetchResponse', value: response}));
    }
};
globalThis.XMLHttpRequest = class {
    open() {}
    overrideMimeType() {}
    send() { this.status = 200; this.responseText = ''; }
};
globalThis.AbortSignal = { timeout: () => undefined };
globalThis.Worker = class Worker {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.source = objectUrls.get(url);
        this.listeners = new Map();
        this.messages = [];
        capturedWorkers.push(this);
    }
    addEventListener(name, listener) {
        let listeners = this.listeners.get(name);
        if (!listeners) this.listeners.set(name, listeners = []);
        listeners.push(listener);
    }
    removeEventListener(name, listener) {
        this.listeners.set(name, (this.listeners.get(name) ?? []).filter(callback => callback !== listener));
    }
    emit(name, data) {
        for (const listener of this.listeners.get(name) ?? []) listener({data});
    }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
};

const preferences = new Map();
globalThis.localStorage = Object.freeze({
    getItem(key) { return preferences.get(key) ?? null; },
    setItem(key, value) { preferences.set(key, String(value)); },
    removeItem(key) { preferences.delete(key); }
});

function route(url, body, init = {}) {
    const address = new URL(url, location.href).href;
    inputRoutes.set(address, { body, init });
}
globalThis.fetch = async (input, init) => {
    const request = new FakeRequest(input, init);
    requests.push({ url: request.url, headers: Object.fromEntries(request.headers), body: request.body });
    if (request.url.startsWith('data:')) return new Response('generated media');
    const match = inputRoutes.get(request.url);
    if (!match) throw new Error('No fake route for ' + request.url);
    if (match.init.networkError) throw new Error(match.init.networkError);
    return new Response(match.body, { url: request.url, type: 'basic', ...match.init });
};

function installPlayer() {
    const activity = [];
    const player = {
        isPaused: () => false,
        getPosition: () => 30,
        getBufferDuration: () => 3,
        getBufferedPosition: () => 33,
        play: () => activity.push('play'),
        pause: () => activity.push('pause'),
        core: { state: { muted: true, volume: 0.4, quality: {group: '720p'} } }
    };
    const controller = {
        props: { content: { type: 'live' } },
        setInitialPlaybackSettings() {},
        setSrc() { activity.push('reload'); }
    };
    const playerNode = { stateNode: { setPlayerActive() {}, props: { mediaPlayerInstance: player } } };
    playerNode.sibling = {stateNode: controller};
    const reactRoot = { _reactRootContainer: { _internalRoot: { current: {child: playerNode} } } };
    document.querySelector = selector => selector === '#root' ? reactRoot : null;
    return activity;
}
`;

function context() {
    const sandbox = vm.createContext({ URL }, {
        codeGeneration: { strings: true, wasm: false },
    });
    vm.runInContext(browser, sandbox, { filename: 'fake-browser.js', timeout: 1000 });
    return {
        run(code, filename = 'fixture.js') {
            return vm.runInContext(code, sandbox, { filename, timeout: 1000 });
        },
        evaluate(code) {
            return JSON.parse(this.run(`JSON.stringify(${code})`));
        },
    };
}

function loadScript(source, path) {
    const page = context();
    page.run(source, path);
    return page;
}

function loadWorker(page) {
    const source = page.run(`new Worker('blob:https://www.twitch.tv/player-fixture').source`);
    if (!source) throw new Error('The player worker was not wrapped');
    const worker = context();
    worker.run(source, 'generated-worker.js');
    return worker;
}

async function outcome(promise) {
    let result = { state: 'pending' };
    Promise.resolve(promise).then(
        value => { result = { state: 'fulfilled', value }; },
        error => { result = { state: 'rejected', message: error.message }; },
    );
    await new Promise(resolve => setImmediate(resolve));
    return result;
}

module.exports = { loadScript, loadWorker, outcome };
