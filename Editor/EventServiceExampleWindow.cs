// #define COMMUNICATION_PUBLIC_API
#if COMMUNICATION_PUBLIC_API
using System;
using UnityEditor.MPE;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

public class EventServiceExampleWindow : EditorWindow
{
    const string k_WebEmit1 = "webEmit1";
    const string k_WebRequest1 = "webRequest1";
    const string k_UnityEmit1 = "unityEmit1";
    const string k_UnityRequest1 = "unityRequest1";

    Action m_WebEmit1Off = () => { };
    Action m_WebRequest1Off = () => { };

    [MenuItem("Tools/Open EventServiceExample Window")]
    static void Init()
    {
        GetWindow<EventServiceExampleWindow>();
    }

    void OnEnable()
    {
        m_WebEmit1Off = EventService.RegisterEventHandler(k_WebEmit1, (type, data) =>
        {
            Debug.Log($"On {k_WebEmit1}: [{type}] {string.Join(",", data)}");
        });

        m_WebRequest1Off = EventService.RegisterEventHandler(k_WebRequest1, (type, data) =>
        {
            Debug.Log($"On {k_WebRequest1}: [{type}] {string.Join(",", data)}");
            return new object[] { "test", 42, 123.4f };
        });

        var emit1Button = new Button(EmitUnity1);
        emit1Button.text = "Test Emit 1";
        rootVisualElement.Add(emit1Button);

        var request1Button = new Button(RequestUnity1);
        request1Button.text = "Test Request 1";
        rootVisualElement.Add(request1Button);
    }

    void OnDisable()
    {
        m_WebEmit1Off();
        m_WebRequest1Off();
    }

    static void EmitUnity1()
    {
        EventService.Emit(k_UnityEmit1, new object[] {"test", 42});
    }

    static void RequestUnity1()
    {
        EventService.Request(k_UnityRequest1, (err, data) =>
        {
            if (err != null)
            {
                Debug.LogException(err);
                return;
            }
            Debug.Log($"On receiving {k_UnityRequest1}: {string.Join(",", data)}");
        }, new object[] { "test", 42 });
    }
}
#endif