import * as eventService from "./event-service.js"

const kWebEmit1 = "webEmit1";
const kWebRequest1 = "webRequest1";
const kUnityEmit1 = "unityEmit1";
const kUnityRequest1 = "unityRequest1";

// Setup UI
document.getElementById("emit1").addEventListener("click", OnEmit1);
document.getElementById("request1").addEventListener("click", OnRequest1);
document.getElementById("log1").addEventListener("click", OnLog1);

// Setup EventService
eventService.Start();
let unityEmit1OffHandler = eventService.On(kUnityEmit1, (eventType, data) => {
    console.log(`On ${kUnityEmit1}: [${eventType}] ${data.join(",")}`)
    unityEmit1OffHandler();
});
let unityRequest1OffHandler = eventService.On(kUnityRequest1, (eventType, data) => {
    console.log(`On ${kUnityRequest1}: [${eventType}] ${data.join(",")}`)
    return [1, "2", 3.0];
});

function OnEmit1()
{
    eventService.Emit(kWebEmit1, [1, "2", 3.0]);
}

function OnRequest1()
{
    eventService.Request(kWebRequest1, (err, data) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log(`On receiving ${kWebRequest1}: ${data.join(",")}`);
    }, [1, "2", 3.0]);
}

function OnLog1()
{
    eventService.Log("This tests the EventService.Log() function.");
}
