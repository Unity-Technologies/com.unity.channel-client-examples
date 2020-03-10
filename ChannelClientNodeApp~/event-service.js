
const kRequest = "request";
const kRequestAcknowledge = "requestAck";
const kRequestExecute = "requestExecute";
const kRequestResult = "requestResult";

const kEvent = "event";
const kLog = "log";
const kRequestDefaultTimeout = 700;

const kAddress = "127.0.0.1";
const kPort = 61149;

let s_Events = new Map();
let s_Requests = new Map();

let ws = null;
let connected = false;
let connectionId = -1;

let requestId = -1;

class RequestData {
    eventType;
    id;
    promises;
    offerStartTime;
    isAcknowledged;
    data;
    timeoutInMs;
    dataInfos;
}

class RequestMessage {
    reqType;
    eventType;
    senderId;
    requestId;
    data;
    dataInfos;
    eventDataSerialization;
}

const EventDataSerialization = {
    StandardJson: 0,
    JsonUtility: 1
}

// API functions
export function Start() {
    const connectTo = `ws://${kAddress}:${kPort}/event`;
    ws = new WebSocket(connectTo);
    ws.onopen = OnOpen;
    ws.onclose = OnClose;
    ws.onerror = OnError;
    ws.onmessage = OnMessage;
}

export function Close() {
    connected = false;
    connectionId = -1;
    Clear();
}

export function Clear() {
    s_Requests.clear();
}

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

export function IsConnected() {
    return connected;
}

export function Emit(eventType, args, targetId = -1) {
    if (!Array.isArray(args) && !!args) {
        args = [args];
    }

    let notifyWildcard = true;
    let req = CreateRequest(kEvent, eventType, targetId, -1, args);

    NotifyLocalListeners(eventType, args, notifyWildcard);

    SendRequest(req);
}

export function IsRequestPending(eventType) {
    return s_Requests.has(eventType);
}

export function CancelRequest(eventType, message = null) {
    if (!s_Requests.has(eventType))
        return false;

    let request = s_Requests.get(eventType);
    CleanRequest(eventType);
    Reject(request, new Error(!!message ? message : `Request ${eventType} canceled`));
    return true;
}

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

export function Log(msg)
{
    var req = CreateRequest(kLog, null, -1, -1, msg, null);
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
}

function OnMessage(ev) {
    if (IsConnected()) {
        HandleIncomingEvent(ev)
    } else {
        // The server sends us our connectionId in plain text
        let data = ev["data"];
        connectionId = parseInt(data);
        connected = true;
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
    req["senderId"] = connectionId;
    if (requestId)
        req["requestId"] = requestId;
    req["data"] = args;
    if (dataInfos)
        req["dataInfos"] = dataInfos;

    return req;
}

function SendRequest(request) {
    ws.send(JSON.stringify(request));
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
            console.exception(ex);
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

                // var message = CreateRequestMsgWithDataString(kRequestExecute, msg.eventType, msg.senderId, msg.requestId, pendingRequest.data, pendingRequest.dataInfos);
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
    if (msg.senderId === connectionId) {
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
            console.exception(e);
        }
    }
}

function Reject(offer, err) {
    for (let i = 0, end = offer.promises.length; i != end; ++i) {
        try {
            offer.promises[i](err, null);
        }
        catch (e) {
            console.exception(e);
        }
    }
}

function HasHandlers(eventType) {
    return s_Events.has(eventType) && s_Events.get(eventType).length > 0;
}

function GetNewRequestId() {
    return ++requestId;
}

function GetPendingRequest(eventType, requestId) {
    if (!s_Requests.has(eventType)) {
        return null;
    }
    let pendingRequest = s_Requests.get(eventType);
    if (pendingRequest != null && pendingRequest.id != requestId) {
        // Mismatch request: clean it.
        CleanRequest(eventType);
        pendingRequest = null;
    }
    return pendingRequest != null && pendingRequest.id == requestId ? pendingRequest : null;
}
