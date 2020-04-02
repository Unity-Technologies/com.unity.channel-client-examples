// #define COMMUNICATION_PUBLIC_API
#if COMMUNICATION_PUBLIC_API
using UnityEditor;
using UnityEngine;
using UnityEditor.MPE;
using System;

public static class EventServiceDocExample
{
    static Action s_CustomLogEventDisconnect;
    static Action s_PingPongEventDisconnect;

    [MenuItem("EventServiceDoc/Step 0")]
    static void StartChannelService()
    {
        if (!ChannelService.IsRunning())
        {
            ChannelService.Start();
        }
        Debug.Log($"[Step 0] ChannelService Running: {ChannelService.GetAddress()}:{ChannelService.GetPort()}");
    }

    [MenuItem("EventServiceDoc/Step 1")]
    static void SetupEventServiceHandlers()
    {
        Debug.Log("[Step 1] Setup handlers");
        s_CustomLogEventDisconnect = EventService.RegisterEventHandler("custom_log", (eventType, args) => {
            Debug.Log($"Log a {eventType} {args[0]}");
        });

        s_PingPongEventDisconnect = EventService.RegisterEventHandler("pingpong", (eventType, args) =>
        {
            Debug.Log($"Receive a {eventType} {args[0]}");
            return "pong!";
        });
    }

    [MenuItem("EventServiceDoc/Step 2")]
    static void EmitMessage()
    {
        Debug.Log("[Step 2] Emitting a custom log");
        EventService.Emit("custom_log", "Hello world!", -1, EventDataSerialization.JsonUtility);
    }

    [MenuItem("EventServiceDoc/Step 3")]
    static void SendRequest()
    {
        Debug.Log("[Step 3] Sending a request");
        EventService.Request("pingpong", (err, data) =>
        {
            Debug.Log($"Request fulfilled: {data[0]}");
        },
        "ping", -1, EventDataSerialization.JsonUtility);
    }

    [MenuItem("EventServiceDoc/Step 4")]
    static void CloseHandlers()
    {
        Debug.Log("[Step 4] Closing all Event handlers");
        s_CustomLogEventDisconnect();
        s_PingPongEventDisconnect();
    }
}

/*

If you execute the 5 menu item one after the other, this will print the following 
in the console:

[Step 0] ChannelService Running: 127.0.0.1:65000

[Step 1] Setup handlers

[Step 2] Emitting a custom log

Log a custom_log Hello world!

[Step 3] Sending a request

Receive a pingpong ping

Request fulfilled: pong!

[Step 4] Closing all Event handlers

*/
#endif