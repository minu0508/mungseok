// 0:07, 12:04, 1:02:09
export const clock = (s: number) =>
  `${s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// 7초, 12분 4초, 1시간 2분
export const korean = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60
  return [h && `${h}시간`, m && `${m}분`, !h && (sec || !m) && `${sec}초`].filter(Boolean).join(' ')
}
