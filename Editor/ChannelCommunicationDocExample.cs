#define COMMUNICATION_PUBLIC_API
#if COMMUNICATION_PUBLIC_API
using System;
using System.Text;
using UnityEditor.MPE;
using UnityEditor;
using UnityEngine;

public static class ChannelCommunicationDocExample
{
    [MenuItem("ChannelDoc/Step 1")]
    static void StartChannelService()
    {
        if (!ChannelService.IsRunning())
        {
            ChannelService.Start();
        }
        Debug.Log($"[Step1] ChannelService Running: {ChannelService.GetAddress()}:{ChannelService.GetPort()}");
    }

    static int s_BinaryChannelId;
    static int s_StringChannelId;
    static Action s_DisconnectBinaryChannel;
    static Action s_DisconnectStringChannel;

    [MenuItem("ChannelDoc/Step 2")]
    static void SetupChannelService()
    {
        if (s_DisconnectBinaryChannel == null)
        {
            s_DisconnectBinaryChannel = ChannelService.GetOrCreateChannel("custom_binary_ping_pong", HandleChannelBinaryMessage);
            s_BinaryChannelId = ChannelService.ChannelNameToId("custom_binary_ping_pong");
        }
        Debug.Log($"[Step2] Setup channel_custom_binary id: {s_BinaryChannelId}");

        if (s_DisconnectStringChannel == null)
        {
            s_DisconnectStringChannel = ChannelService.GetOrCreateChannel("custom_ascii_ping_pong", HandleChannelStringMessage);
            s_StringChannelId = ChannelService.ChannelNameToId("custom_ascii_ping_pong");
        }
        Debug.Log($"[Step2] Setup channel_custom_ascii id: {s_StringChannelId}");
    }

    static void HandleChannelBinaryMessage(int connectionId, byte[] data)
    {
        var msg = "";
        for (var i = 0; i < Math.Min(10, data.Length); ++i)
        {
            msg += data[i].ToString();
        }
        Debug.Log($"Channel Handling binary from connection {connectionId} - {data.Length} bytes - {msg}");

        // Let's pong it back:
        ChannelService.Send(connectionId, data);
    }

    static void HandleChannelStringMessage(int connectionId, byte[] data)
    {
        // We are receiving a new message. All message are always handled as bytes in a ChannelHandler.
        // Since our clients are expecting string data, encode the data and send it back as a string:

        var msgStr = Encoding.UTF8.GetString(data);
        Debug.Log($"Channel Handling string from connection {connectionId} - {msgStr}");

        // Let's pong it back:
        ChannelService.Send(connectionId, msgStr);
    }

    static ChannelClient s_BinaryClient;
    static Action s_DisconnectBinaryClient;
    static ChannelClient s_StringClient;
    static Action s_DisconnectStringClient;
    [MenuItem("ChannelDoc/Step 3")]
    static void SetupChannelClient()
    {
        const bool autoTick = true;

        if (s_BinaryClient == null)
        {
            s_BinaryClient = ChannelClient.GetOrCreateClient("custom_binary_ping_pong");
            s_BinaryClient.Start(autoTick);
            s_DisconnectBinaryClient = s_BinaryClient.RegisterMessageHandler(HandleClientBinaryMessage);
        }
        Debug.Log($"[Step3] Setup client for channel custom_binary_ping_pong. ClientId: {s_BinaryClient.clientId}");

        if (s_StringClient == null)
        {
            s_StringClient = ChannelClient.GetOrCreateClient("custom_ascii_ping_pong");
            s_StringClient.Start(autoTick);
            s_DisconnectStringClient = s_StringClient.RegisterMessageHandler(HandleClientStringMessage);
        }
        Debug.Log($"[Step3] Setup client for channel custom_ascii_ping_pong. ClientId: {s_StringClient.clientId}");
    }

    static void HandleClientBinaryMessage(byte[] data)
    {
        Debug.Log($"Receiving pong binary data: {data} for clientId: {s_BinaryClient.clientId} with channelName: {s_BinaryClient.channelName}");
    }

    static void HandleClientStringMessage(string data)
    {
        Debug.Log($"Receiving pong data: {data} for clientId: {s_StringClient.clientId} with channelName: {s_StringClient.channelName}");
    }

    [MenuItem("ChannelDoc/Step 4")]
    static void ClientSendMessageToServer()
    {
        Debug.Log("[Step 4]: Clients are sending data!");
        s_BinaryClient.Send(new byte[] { 0, 1, 2, 3, 4, 5, 6, 7 });
        s_StringClient.Send("Hello world!");
    }

    [MenuItem("ChannelDoc/Step 5")]
    static void CloseClients()
    {
        Debug.Log("[Step 5]: Closing clients");
        s_DisconnectBinaryClient();
        s_BinaryClient.Close();

        s_DisconnectStringClient();
        s_StringClient.Close();
    }

    [MenuItem("ChannelDoc/Step 6")]
    static void CloseService()
    {
        Debug.Log("[Step 6]: Closing clients");

        s_DisconnectBinaryChannel();
        s_DisconnectStringChannel();

        ChannelService.Stop();
    }
}

/*
If you execute the 6 menu item one after the other, this will print the following 
in the console:

[Step1] ChannelService Running: 127.0.0.1:64647

[Step2] Setup channel_custom_binary id: -1698345965

[Step2] Setup channel_custom_ascii id: -930064725

[Step3] Setup client for channel custom_binary_ping_pong. ClientId: -1698345965

[Step3] Setup client for channel custom_ascii_ping_pong. ClientId: -930064725

[Step 4]: Clients are sending data!

Channel Handling binary from connection 1 - 8 bytes - 01234567

Channel Handling string from connection 2 - Hello world!

Receiving pong binary data: System.Byte[] for clientId: -1698345965 with channelName: custom_binary_ping_pong

Receiving pong data: Hello world! for clientId: -930064725 with channelName: custom_ascii_ping_pong

[Step 5]: Closing clients

[Step 6]: Closing clients

*/
#endif