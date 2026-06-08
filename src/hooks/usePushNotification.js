import { supabase } from '../supabaseClient.js'

const VAPID_PUBLIC_KEY = 'BE5SiDWcpJ1NdA2fFVivgwh7UNNU6hewgRueT7hSulBWzF874cyiGu0LaVs6KedqjKFuJOjDCoy1VbenV2Vn0IM'

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
    return outputArray
}

export async function subscribePush(userName) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return false

        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        const subscription = existing || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })

        const sub = subscription.toJSON()
        await supabase.from('push_subscriptions').upsert({
            user_name: userName,
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
        }, { onConflict: 'endpoint' })

        return true
    } catch (err) {
        console.error('Push 구독 실패:', err)
        return false
    }
}
