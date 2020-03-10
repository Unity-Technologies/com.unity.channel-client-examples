const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const channelServiceInfoFile = path.join(process.env.LOCALAPPDATA, "Unity", "Editor", "ChannelService.info");

function unityChannelConnect(name, isBinary, readyForConnectionCallback)
{
    if (!fs.existsSync(channelServiceInfoFile))
        throw `${channelServiceInfoFile} doesn't exists. ChannelService is not started.`

    const addr = fs.readFileSync(channelServiceInfoFile);
    const connectTo = `ws://${addr}/${name}`;
    console.log("Trying to connect to " + connectTo);

    // Note that the port is dynamic...
    const socket = new WebSocket(connectTo);
    if (isBinary)
        socket.binaryType = 'arraybuffer';

    const binStatus = isBinary ? "binary" : "";

    var isReady = false;

    // Connection opened
    socket.addEventListener('open', function (event) {
        console.log(`[${name}] Connected ${binStatus}`);
    });

    socket.addEventListener('close', function (event) {
        console.log(`[${name}] Closed ${binStatus}`);
    });

    // Listen for messages
    socket.addEventListener('message', function (event) {
        if (!isReady)
        {
            isReady = true;
            readyForConnectionCallback();
        }

        if (isBinary)
            console.log(`[${name} - binary] ${event.data}`);
        else
            console.log(`[${name}] ${event.data}`);
    });

    return socket;
}

var binaryConnection = unityChannelConnect("custom_binary_ping_pong", true, () => {    
    const array = new Int32Array(5);
    for (var i = 0; i < array.length; ++i) {
        array[i] = i;
    }
    binaryConnection.send(array);
});

var stringConnection = unityChannelConnect("custom_ascii_ping_pong", false, () => {    
    stringConnection.send("hello ascii world!!!");
});