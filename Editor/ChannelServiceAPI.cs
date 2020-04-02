using System;
using System.IO;
using System.Linq;
using System.Reflection;
#if COMMUNICATION_PUBLIC_API
using UnityEditor.MPE;
#else 
using Unity.MPE;
#endif
using UnityEditor;
using UnityEngine;

public static class ChannelServiceAPI
{
    static Type[] s_AllTypes;
    static Type s_ChannelServiceType;
    static Type s_ChannelInfoType;
    static Type s_ChannelHandlerType;
    static ChannelServiceAPI()
    {
        var assembly = typeof(EventService).Assembly;
        s_AllTypes = assembly.GetTypes().ToArray();
        s_ChannelServiceType = s_AllTypes.FirstOrDefault(t => t.Name == "ChannelService");
        s_ChannelInfoType = s_AllTypes.FirstOrDefault(t => t.Name == "ChannelInfo");
        s_ChannelHandlerType = s_AllTypes.FirstOrDefault(t => t.Name == "ChannelHandler");

        EditorApplication.quitting += () =>
        {
            var infoFile = GetIsConnectedFile();
            if (File.Exists(infoFile))
            {
                File.Delete(infoFile);
            }
        };
    }

    public static void StartChannelService()
    {
        Debug.Log("Starting ChannelService");
        var startFunction = s_ChannelServiceType.GetMethod("Start", BindingFlags.Public | BindingFlags.Static);
        startFunction.Invoke(null, new object[0]);

        if (IsRunning())
        {
            var infoFile = GetIsConnectedFile();
            if (File.Exists(infoFile))
            {
                File.Delete(infoFile);
            }
            File.WriteAllText(infoFile, $"{GetAddress()}:{GetPort()}");
        }
    }

    public static void CloseChannel(string channelName)
    {
        Debug.Log($"Closing Channel {channelName}");
        var startFunction = s_ChannelServiceType.GetMethod("Start", BindingFlags.Public | BindingFlags.Static);
        startFunction.Invoke(null, new object[0]);
    }

    public static void StopChannelService()
    {
        Debug.Log("Stopping ChannelService");
        var stopFunction = s_ChannelServiceType.GetMethod("Stop", BindingFlags.Public | BindingFlags.Static);
        stopFunction.Invoke(null, new object[0]);
    }

    public static int GetChannelId(string channelName)
    {
        var getChannelInfoFunction = s_ChannelServiceType.GetMethod("GetChannelFromName", BindingFlags.NonPublic | BindingFlags.Static);
        var channelInfo = getChannelInfoFunction.Invoke(null, new [] { channelName });
        var channelIdProperty = s_ChannelInfoType.GetProperty("channelId", BindingFlags.Public | BindingFlags.Instance);
        return (int)channelIdProperty.GetValue(channelInfo);
    }

    public static string GetAddress()
    {
        var getAddressFunction = s_ChannelServiceType.GetMethod("GetAddress", BindingFlags.Public | BindingFlags.Static);
        return getAddressFunction.Invoke(null, new object[0]) as string;
    }

    public static bool IsRunning()
    {
        var isRunningFunction = s_ChannelServiceType.GetMethod("IsRunning", BindingFlags.Public | BindingFlags.Static);
        return (bool)isRunningFunction.Invoke(null, new object[0]);
    }

    public static int GetPort()
    {
        var getPortFunction = s_ChannelServiceType.GetMethod("GetPort", BindingFlags.Public | BindingFlags.Static);
        return (int)getPortFunction.Invoke(null, new object[0]);
    }

    internal static Action GetOrCreateChannel(string channelName, Action<int,byte[]> handler)
    {
        Debug.Log($"Channel {channelName} ready");
        var getOrCreateChannelFunction = s_ChannelServiceType.GetMethod("GetOrCreateChannel", BindingFlags.Public | BindingFlags.Static);
        return getOrCreateChannelFunction.Invoke(null, new object[] { channelName, handler }) as Action;
    }

    // Broadcast to all connections on the same channel
    public static void BroadcastBinary(int channelId, byte[] data)
    {
        var broadcastFunction = s_ChannelServiceType.GetMethod("BroadcastBinary", BindingFlags.NonPublic | BindingFlags.Static);
        broadcastFunction.Invoke(null, new object[] { channelId, data });
    }

    // Send direct message to specific connection
    public static void SendBinary(int connectionId, byte[] data)
    {
        var sendFunction = s_ChannelServiceType.GetMethod("SendBinary", BindingFlags.NonPublic | BindingFlags.Static);
        sendFunction.Invoke(null, new object[] { connectionId, data });
    }

    public static void Broadcast(int channelId, byte[] data)
    {
        var broadcastFunction = s_ChannelServiceType.GetMethods(BindingFlags.Public | BindingFlags.Static).First(mi => mi.Name == "Broadcast" && mi.GetParameters()[1].ParameterType == typeof(string));
        broadcastFunction.Invoke(null, new object[] { channelId, data });
    }

    // Send direct message to specific connection
    public static void Send(int connectionId, string data)
    {
        var sendFunction = s_ChannelServiceType.GetMethods(BindingFlags.Public | BindingFlags.Static).First(mi => mi.Name == "Send" && mi.GetParameters()[1].ParameterType == typeof(string));
        sendFunction.Invoke(null, new object[] { connectionId, data });
    }

    static Delegate ConvertDelegate(Delegate sourceDelegate, Type targetType)
    {
        return Delegate.CreateDelegate(
            targetType,
            sourceDelegate.Target,
            sourceDelegate.Method);
    }

    static string GetIsConnectedFile()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Unity", "Editor", "ChannelService.info").Replace("\\", "/");
    }
}
