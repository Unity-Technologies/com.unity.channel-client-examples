/**
 * EventService module
 * @module event-service
 */

const kRequest = "request";
const kRequestAcknowledge = "requestAck";
const kRequestExecute = "requestExecute";
const kRequestResult = "requestResult";

const kEvent = "event";
const kLog = "log";
const kRequestDefaultTimeout = 700;

const kAddress = "127.0.0.1";

/**
 * Callback used to handle an Emit or Request.
 *
 * @callback onHandler
 * @param {string} eventType The type of the event. Corresponds to the eventType used in Emit and Request.
 * @param {object[]} data The data sent by Emit or Request.
 * @returns {*} Nothing in the case of a Emit handler, otherwise anything.
 */

/**
 * Callback used to handle the result of a Request.
 *
 * @callback promiseHandler
 * @param {Error} err The error, if there was an error or the request has been cancelled. Null otherwise.
 * @param {object[]} data The result of all request handlers.
 */

/**
 * Callback used to unregister an event handler registered with the function On.
 *
 * @callback offHandler
 */

/**
 * Map of event handlers.
 * @type {Map<string, onHandler>}
 */
let s_Events = new Map();

/**
 * Map of requests.
 * @type {Map<string, RequestData>}
 */
let s_Requests = new Map();

let s_Ws = null;
let s_Connected = false;
let s_ConnectionId = -1;

let s_RequestId = 0;

let s_TickTimer = null;

/**
 * Enum for event data serialization.
 * @readonly
 * @enum {number}
 */
const EventDataSerialization = {
    /** @type {number} */
    StandardJson: 0,
    /** @type {number} */
    JsonUtility: 1
}

class RequestData {
    /** @type {string} */
    eventType;
    /** @type {number} */
    id;
    /** @type {promiseHandler[]} */
    promises;
    /** @type {number} */
    offerStartTime;
    /** @type {boolean} */
    isAcknowledged;
    /** @type {object} */
    data;
    /** @type {number} */
    timeoutInMs;
    /** @type {object} */
    dataInfos;
}

class RequestMessage {
    /** @type {string} */
    reqType;
    /** @type {string} */
    eventType;
    /** @type {number} */
    senderId;
    /** @type {number} */
    requestId;
    /** @type {object} */
    data;
    /** @type {object} */
    dataInfos;
    /** @type {EventDataSerialization} */
    eventDataSerialization;
}

// API functions

export class OperationCanceledException extends Error {
    /**
     * Construct a new OperationCanceledException.
     * @param {string} message The error message.
     */
    constructor(message) {
        super(message);
        this.name = 'OperationCanceledException';
    }
}

export class TimeoutException extends Error {
    /**
     * Construct a new TimeoutException.
     * @param {string} message The error message.
     */
    constructor(message) {
        super(message);
        this.name = 'TimeoutException';
    }
}

/**
 * Start the EventService.
 * @param {number} port Port on which to connect to.
 */
export function Start(port) {
    const connectTo = `ws://${kAddress}:${port}/event`;
    s_Ws = new WebSocket(connectTo);
    s_Ws.onopen = OnOpen;
    s_Ws.onclose = OnClose;
    s_Ws.onerror = OnError;
    s_Ws.onmessage = OnMessage;

    s_TickTimer = setInterval(Tick, 0);
}

/**
 * Close the EventService. This function is called automatically when the websocket is closed or there is an error.
 */
export function Close() {
    s_Connected = false;
    s_ConnectionId = -1;
    Clear();

    clearInterval(s_TickTimer);
}

/**
 * Clears all pending requests.
 */
export function Clear() {
    s_Requests.clear();
}

/**
 * Register an event handler for a specific event raised by Emit or Request.
 * @param {string} eventType The type of event to handle.
 * @param {onHandler} onHandler Callback that handles the event.
 * @returns {offHandler} Callback that you can call to unregister the handler.
 */
export function On(eventType, onHandler) {
    let handlers = null;
    if (!s_Events.has(eventType)) {
        handlers = [];
        s_Events.set(eventType, handlers);
    }
    handlers = s_Events.get(eventType);
    if (handlers.includes(onHandler)) {
        throw "Cannot add existing event handler: " + eventType;
    }
    handlers.push(onHandler);

    return () => {
        Off(eventType, onHandler)
    }
}

/**
 * Unregister an event handler.
 * @param {string} eventType The type of event to handle.
 * @param {onHandler} onHandler The handler to unregister.
 */
export function Off(eventType, onHandler) {
    if (s_Events.has(eventType)) {
        let handlers = s_Events.get(eventType);
        let index = handlers.indexOf(onHandler)
        if (index > -1)
            handlers.splice(index, 1);
        if (handlers.length === 0) {
            s_Events.delete(eventType);
        }
    }
}

/**
 * Check if the EventService is connected to the server.
 * @return {boolean} True if the EventService is connected.
 */
export function IsConnected() {
    return s_Connected;
}

/**
 * Emit an event with some values.
 * @param {string} eventType The type of event to emit.
 * @param {object|object[]} args Values to send. Can be null.
 * @param {number} [targetId=-1] Target client Id. -1 for any client.
 */
export function Emit(eventType, args, targetId = -1) {
    if (!Array.isArray(args) && !!args) {
        args = [args];
    }

    let notifyWildcard = true;
    let req = CreateRequest(kEvent, eventType, targetId, -1, args);

    NotifyLocalListeners(eventType, args, notifyWildcard);

    SendRequest(req);
}

/**
 * Check if there is any request pending for a specific event.
 * @param {string} eventType Type of event.
 * @returns {boolean} True if there is any request pending.
 */
export function IsRequestPending(eventType) {
    return s_Requests.has(eventType);
}

/**
 * Cancel any pending requests for a specific event.
 * @param {string} eventType Type of event.
 * @param {string} [message=null] Message to send to the request handler.
 * @returns {boolean} True if the request was canceled.
 */
export function CancelRequest(eventType, message = null) {
    if (!s_Requests.has(eventType))
        return false;

    let request = s_Requests.get(eventType);
    CleanRequest(eventType);
    Reject(request, new OperationCanceledException(!!message ? message : `Request ${eventType} canceled`));
    return true;
}

/**
 * Send a request to anyone who is connected to the EventService.
 * @param {string} eventType Type of event to request.
 * @param {promiseHandler} promiseHandler Callback that handles the result of the request.
 * @param {object|object[]} args Values to send with the request. Can be null.
 * @param {number} [timeoutInMs=] Number of milliseconds to wait before cancelling the request automatically.
 */
export function Request(eventType, promiseHandler, args, timeoutInMs = kRequestDefaultTimeout) {
    if (!Array.isArray(args) && !!args) {
        args = [args];
    }

    if (s_Requests.has(eventType)) {
        let request = s_Requests.get(eventType);
        request.promises.push(promiseHandler);
        return;
    }

    let request = new RequestData();
    request.eventType = eventType;
    request.promises = [promiseHandler];
    request.timeoutInMs = timeoutInMs;

    if (HasHandlers(eventType)) {
        let results = NotifyLocalListeners(eventType, args, false);

        let exception = results.find(r => r instanceof Error);
        if (exception) {
            Reject(request, exception);
        }
        else {
            Resolve(request, results);
        }
    }
    else {
        request.offerStartTime = Date.now();
        let requestId = GetNewRequestId();
        request.id = requestId;

        let msg = CreateRequest(kRequest, eventType, -1, requestId, args);
        SendRequest(msg);

        s_Requests.set(eventType, request);
        request.data = msg.data;
        request.dataInfos = msg.dataInfos;
    }
}

/**
 * Send a message to the server to be printed in the console.
 * @param {string} msg Message to log.
 */
export function Log(msg) {
    let req = CreateRequest(kLog, null, -1, -1, msg, null);
    SendRequest(req);
}

// Private functions
function OnOpen(ev) {
}

function OnClose(ev) {
    Close();
}

function OnError(ev) {
    Close();
    console.error(ev);
}

function OnMessage(ev) {
    if (IsConnected()) {
        HandleIncomingEvent(ev)
    } else {
        // The server sends us our connectionId in plain text
        let data = ev["data"];
        s_ConnectionId = parseInt(data);
        s_Connected = true;
    }
}

function CreateRequest(msgType, eventType, targetId, requestId, args, dataInfos) {
    let req = {};
    req["req"] = msgType;
    if (targetId != -1) {
        req["targetId"] = targetId;
    }
    if (!!eventType)
        req["type"] = eventType;
    req["senderId"] = s_ConnectionId;
    if (requestId)
        req["requestId"] = requestId;
    req["data"] = args;
    if (dataInfos)
        req["dataInfos"] = dataInfos;

    return req;
}

function SendRequest(request) {
    s_Ws.send(JSON.stringify(request));
}

function NotifyLocalListeners(eventType, data, notifyWildcard) {
    let result = [];
    if (s_Events.has(eventType)) {
        let handlers = s_Events.get(eventType);
        try {
            for (const handler of handlers) {
                result.push(handler(eventType, data));
            }
        }
        catch (ex) {
            result = [ex];
            console.error(ex);
        }
    }

    if (notifyWildcard && s_Events.has("*")) {
        let handlers = s_Events.get(eventType);
        try {
            for (const handler of handlers) {
                handler(eventType, data);
            }
        }
        catch (ex) {
            console.error(ex);
        }
    }

    return result;
}

function HandleIncomingEvent(event) {
    let msg = DeserializeEvent(event);
    if (!msg)
        return;

    switch (msg.reqType) {
        case kRequest: // Receiver
            // We are able to answer this request. Acknowledge it to the sender:
            if (HasHandlers(msg.eventType)) {
                let response = CreateRequest(kRequestAcknowledge, msg.eventType, msg.senderId, msg.requestId, null, null);
                SendRequest(response);
            }
            break;
        case kRequestAcknowledge: // Request emitter
            let pendingRequest = GetPendingRequest(msg.eventType, msg.requestId);
            if (pendingRequest != null) {
                // A client is able to fulfill the request: proceed with request execution:
                pendingRequest.isAcknowledged = true;
                pendingRequest.offerStartTime = Date.now();

                let message = CreateRequest(kRequestExecute, msg.eventType, msg.senderId, msg.requestId, pendingRequest.data, pendingRequest.dataInfos);
                SendRequest(message);
            }
            // else Request might potentially have timed out.
            break;
        case kRequestExecute: // Request receiver
            {
                // We are fulfilling the request: send the execution results
                let results = NotifyLocalListeners(msg.eventType, msg.data, false);
                let response = CreateRequest(kRequestResult, msg.eventType, msg.senderId, msg.requestId, results, msg.eventDataSerialization);
                SendRequest(response);
                break;
            }
        case kRequestResult: // Request emitter
            let pendingRequestAwaitingResult = GetPendingRequest(msg.eventType, msg.requestId);
            if (pendingRequestAwaitingResult != null) {
                let timeForSuccess = Date.now() - pendingRequestAwaitingResult.offerStartTime;
                console.log(`[UMPE] Request ${msg.eventType} successful in ${timeForSuccess} ms`);
                Resolve(pendingRequestAwaitingResult, msg.data);
                CleanRequest(msg.eventType);
            }
            break;
        case kEvent:
            {
                NotifyLocalListeners(msg.eventType, msg.data, true);
                break;
            }
    }
}

function DeserializeEvent(event) {
    let msg = JSON.parse(event.data);

    if (!msg) {
        console.error("Invalid message: " + event);
        return null;
    }

    if (!msg.hasOwnProperty("type")) {
        console.error("Message doesn't contain type: " + event);
        return null;
    }

    if (!msg.hasOwnProperty("req")) {
        console.error("Message doesn't contain req: " + event);
        return null;
    }

    if (!msg.hasOwnProperty("senderId")) {
        console.error("Message doesn't contain senderId: " + event);
        return null;
    }

    // If we are receiving our own messages, bail out.
    if (msg.senderId === s_ConnectionId) {
        return null;
    }

    let deserializedMsg = new RequestMessage();

    deserializedMsg.reqType = msg.req;
    deserializedMsg.eventType = msg.type;
    deserializedMsg.senderId = msg.senderId;
    deserializedMsg.requestId = -1;
    if (msg.hasOwnProperty("requestId"))
        deserializedMsg.requestId = msg.requestId;

    if (msg.hasOwnProperty("data"))
        deserializedMsg.data = msg.data;
    if (msg.hasOwnProperty("dataInfos")) {
        deserializedMsg.dataInfos = msg.dataInfos;
        deserializedMsg.eventDataSerialization = EventDataSerialization.JsonUtility;
    }

    return deserializedMsg;
}

function CleanRequest(eventType) {
    s_Requests.delete(eventType);
}

function Resolve(offer, results) {
    for (let i = 0, end = offer.promises.length; i != end; ++i) {
        try {
            offer.promises[i](null, results);
        }
        catch (e) {
            console.error(e);
        }
    }
}

function Reject(offer, err) {
    for (let i = 0, end = offer.promises.length; i != end; ++i) {
        try {
            offer.promises[i](err, null);
        }
        catch (e) {
            console.error(e);
        }
    }
}

function HasHandlers(eventType) {
    return s_Events.has(eventType) && s_Events.get(eventType).length > 0;
}

function GetNewRequestId() {
    return ++s_RequestId;
}

function GetPendingRequest(eventType, requestId) {
    if (!s_Requests.has(eventType)) {
        return null;
    }
    let pendingRequest = s_Requests.get(eventType);
    if (pendingRequest != null && pendingRequest.id != requestId) {
        console.log(`Request Id mismatch: (Pending)${pendingRequest.id} vs (request)${requestId}`);
        // Mismatch request: clean it.
        CleanRequest(eventType);
        pendingRequest = null;
    }
    return pendingRequest != null && pendingRequest.id == requestId ? pendingRequest : null;
}

function Tick() {
    if (!IsConnected())
        return;

    if (s_Requests.size > 0) {
        let now = Date.now();
        for (let request of s_Requests.values()) {
            let elapsedTime = now - request.offerStartTime;
            if (request.isAcknowledged)
                continue;
            if (elapsedTime > request.timeoutInMs) {
                CleanRequest(request.eventType);
                Reject(request, new TimeoutException(`Request timeout for ${request.eventType} (${elapsedTime} > ${request.timeoutInMs})`));
            }
        }
    }
}
