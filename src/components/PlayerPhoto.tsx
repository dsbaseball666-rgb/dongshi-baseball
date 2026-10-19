/** 球員大頭照；沒有照片時顯示姓氏的圓形 */
export function PlayerPhoto({ url, name, size = 44 }: { url?: string; name: string; size?: number }) {
  if (url) return <img className="player-photo" src={url} alt={`${name} 的大頭照`} style={{ width: size, height: Math.round(size * 1.25) }} />;
  return (
    <span className="player-photo empty" style={{ width: size, height: Math.round(size * 1.25), fontSize: size * 0.42 }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}
