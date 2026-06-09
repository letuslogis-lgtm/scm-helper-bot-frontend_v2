import { supabase } from '../supabaseClient.js'

const VAPID_PUBLIC_KEY = 'BNPi4zBNKYIO-0qBbnWsXTxnjOwKX1JqTm0qr1bH31dBAm5SK4B6ISETp25Ef7zgdrbScLLoac-gCgzR7Pc4Koc'
const VAPID_KEY_STORAGE = 'letus_vapid_key'

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

        // VAPID 키가 바뀐 경우 기존 구독 강제 해제 후 재구독
        const storedKey = localStorage.getItem(VAPID_KEY_STORAGE)
        if (existing && storedKey !== VAPID_PUBLIC_KEY) {
            await existing.unsubscribe()
        }

        const subscription = (existing && storedKey === VAPID_PUBLIC_KEY)
            ? existing
            : await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            })

        localStorage.setItem(VAPID_KEY_STORAGE, VAPID_PUBLIC_KEY)

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
