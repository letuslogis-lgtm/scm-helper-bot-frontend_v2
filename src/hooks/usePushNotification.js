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

export async function subscribePush(userName, logFn) {
    const log = logFn || (() => {})
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return false

        const registration = await navigator.serviceWorker.ready
        log('SW ready')

        const existing = await registration.pushManager.getSubscription()
        log('기존구독: ' + (existing ? '있음(' + existing.endpoint.slice(-20) + ')' : '없음'))

        const storedKey = localStorage.getItem(VAPID_KEY_STORAGE)
        if (existing && storedKey !== VAPID_PUBLIC_KEY) {
            await existing.unsubscribe()
            log('VAPID 키 변경 → 기존 구독 해제')
        }

        const subscription = (existing && storedKey === VAPID_PUBLIC_KEY)
            ? existing
            : await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            })

        log('pushManager.subscribe 완료')
        localStorage.setItem(VAPID_KEY_STORAGE, VAPID_PUBLIC_KEY)

        const sub = subscription.toJSON()
        const { error } = await supabase.from('push_subscriptions').upsert({
            user_name: userName,
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
        }, { onConflict: 'endpoint' })

        if (error) { log('DB 저장 실패: ' + error.message); return false }
        log('DB 저장 완료')
        return true
    } catch (err) {
        log('에러: ' + (err?.message || String(err)))
        console.error('Push 구독 실패:', err)
        return false
    }
}
