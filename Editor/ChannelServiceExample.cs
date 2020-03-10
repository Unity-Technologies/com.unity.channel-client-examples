using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using Unity.MPE;
using UnityEditor;
using UnityEngine;

static class ChannelAPIExample
{
    static int s_BinaryChannelId;
    static int s_StringChannelId;
    static Action s_DisconnectBinaryChannel;
    static Action s_DisconnectStringChannel;

    // This function is called each domain reload (i.e each time a script recompiles).
    [InitializeOnLoadMethod]
    static void RegisterChannelService()
    {
        if (!ChannelServiceAPI.IsRunning())
            ChannelServiceAPI.StartChannelService();


        Debug.Log($"ChannelService Running: {ChannelServiceAPI.GetAddress()}:{ChannelServiceAPI.GetPort()}");

        if (s_DisconnectBinaryChannel == null)
        {
            s_DisconnectBinaryChannel = ChannelServiceAPI.GetOrCreateChannel("custom_binary_ping_pong", HandleChannelBinaryMessage);
            s_BinaryChannelId = ChannelServiceAPI.GetChannelId("custom_binary_ping_pong");
            Debug.Log($"channel_custom_binary id: {s_BinaryChannelId}");
        }

        if (s_DisconnectStringChannel == null)
        {
            s_DisconnectStringChannel = ChannelServiceAPI.GetOrCreateChannel("custom_ascii_ping_pong", HandleChannelStringMessage);
            s_StringChannelId = ChannelServiceAPI.GetChannelId("custom_ascii_ping_pong");
            Debug.Log($"channel_custom_ascii id: {s_StringChannelId}");
        }
    }

    [MenuItem("Tools/Register new channels")]
    static void RegisterMenu()
    {
        RegisterChannelService();
    }

    static void HandleChannelBinaryMessage(int connectionId, byte[] data)
    {
        var msg = "";
        for (var i = 0; i < Math.Min(10, data.Length); ++i)
        {
            msg += data[i].ToString();
        }
        Debug.Log($"receiving binary from connection {connectionId} - {data.Length} bytes - {msg}");

        // Let's pong it back:
        ChannelServiceAPI.SendBinary(connectionId, data);
    }

    static void HandleChannelStringMessage(int connectionId, byte[] data)
    {
        var msgStr = Encoding.UTF8.GetString(data);
        Debug.Log($"receiving string from connection {connectionId} - {msgStr}");

        // Let's pong it back:
        ChannelServiceAPI.Send(connectionId, msgStr);

        
    }
}
