'use strict';

window.HoaiBroadcast = (() => {
  const stories = [
    ['Bản tin nửa đêm', 'Midnight Bulletin', 'Đồng hồ điểm 00:00. Ca trực mới bắt đầu.\nKiểm tra chốt cửa trước khi mở radio.\nKhông trả lời tiếng gọi từ bên kia hành lang.', 'The clock strikes 00:00. A new shift begins.\nCheck the locks before switching on the radio.\nDo not answer voices from the corridor.'],
    ['Tiếng gõ trong sương', 'Knocking in the Fog', 'Sương dày đang phủ kín con đường.\nBa tiếng gõ được ghi nhận tại cửa phía bắc.\nTiếp tục quan sát; chưa xác định người bên ngoài.', 'Heavy fog covers the road.\nThree knocks were recorded at the north door.\nKeep watching; the presence outside remains unidentified.'],
    ['Trước giờ bình minh', 'Before Dawn', 'Tín hiệu yếu dần trên kênh giám sát.\nMột bóng người đứng yên dưới cột đèn.\nGiữ ánh sáng thấp và chờ thông báo tiếp theo.', 'The surveillance signal is weakening.\nA figure stands motionless beneath the streetlight.\nKeep the lights low and await the next bulletin.'],
    ['Bản tin buổi sáng', 'Morning Bulletin', '06:00. Thành phố thức dậy trong im lặng.\nCác ô cửa vẫn được yêu cầu che kín.\nCa trực ban ngày đã tiếp nhận tín hiệu.', '06:00. The city wakes in silence.\nAll windows should remain covered.\nThe daytime shift has taken over the signal.'],
    ['Tuyến đường vắng', 'The Empty Route', 'Không ghi nhận phương tiện trên đường chính.\nMột bản phát thanh cũ lặp lại giữa các kênh.\nKhông đi theo tiếng nhạc từ những ngôi nhà trống.', 'No vehicles have been recorded on the main road.\nAn old broadcast repeats between channels.\nDo not follow music coming from empty houses.'],
    ['Hồ sơ lúc 10 giờ', 'The Ten O’Clock File', 'Hồ sơ mới được chuyển tới phòng lưu trữ.\nMột khuôn mặt xuất hiện trên nhiều khung hình.\nMọi chi tiết đang được đối chiếu trong ca trực.', 'A new file has reached the archive.\nThe same face appears in several frames.\nThe current shift is cross-checking every detail.'],
    ['Cảnh báo giữa trưa', 'Noon Advisory', '12:00. Ánh sáng ngoài cửa đang mạnh lên.\nỞ trong phòng, tránh các ô cửa không có rèm.\nĐài vẫn phát; hãy giữ liên lạc qua tín hiệu.', '12:00. The light outside is intensifying.\nRemain indoors and avoid uncovered windows.\nThe station is still transmitting; stay tuned.'],
    ['Tín hiệu từ vùng tro', 'Signal from the Ashlands', 'Một tín hiệu ngắn truyền về từ vùng tro tàn.\nKhông có lời nói, chỉ có tiếng bước chân.\nBản ghi đã được đưa vào kho để theo dõi.', 'A brief signal arrived from the Ashlands.\nNo voices, only footsteps.\nThe recording has been archived for observation.'],
    ['Ca trực chiều', 'Afternoon Watch', '16:00. Kiểm tra lại các góc camera.\nBóng đổ trên tường không khớp với khung cửa.\nĐánh dấu sự kiện và tiếp tục giữ khoảng cách.', '16:00. Check every camera angle again.\nThe shadow on the wall does not match the doorway.\nLog the event and keep your distance.'],
    ['Khi thành phố tắt đèn', 'When the City Goes Dark', 'Đèn đường đang lần lượt tắt.\nCác tuyến quan sát chuyển sang chế độ ban đêm.\nNếu có khách, kiểm tra trước khi mở cửa.', 'The streetlights are going out one by one.\nObservation channels are entering night mode.\nIf a visitor arrives, check before opening the door.'],
    ['Khách ngoài cửa', 'Visitor at the Door', '20:00. Có chuyển động ở lối vào.\nNgười bên ngoài nói đã từng gặp bạn.\nĐừng để một giọng nói quen thuộc thay cho việc kiểm tra.', '20:00. Movement has been detected at the entrance.\nThe person outside claims to know you.\nA familiar voice is no substitute for checking.'],
    ['Bản tin cuối ngày', 'The Final Bulletin', 'Ca trực cuối ngày đang khép lại hồ sơ.\nGiữ radio ở mức đủ nghe, kiểm tra cửa lần cuối.\n00:00 sẽ bắt đầu một vòng phát mới.', 'The final shift is closing today’s files.\nKeep the radio audible and check the door once more.\nA new broadcast cycle begins at 00:00.']
  ];
  const defaults = stories.map(([title_vi, title_en, body_vi, body_en], index) => ({ hour: index * 2, title_vi, title_en, body_vi, body_en, revision: null }));
  const localKey = 'HOAI_BROADCAST_V1';
  let overrides = [];
  let error = null;
  let loading = false;
  let saving = false;
  let generation = 0;

  function validate(slot) {
    if (!slot || !Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 22 || slot.hour % 2 !== 0) throw new Error('Khung giờ không hợp lệ.');
    for (const [field, limit] of [['title_vi',160],['title_en',160],['body_vi',2000],['body_en',2000]]) {
      if (typeof slot[field] !== 'string' || !slot[field].trim() || slot[field].length > limit) throw new Error('Nhập đủ nội dung Việt và Anh trong giới hạn cho phép.');
    }
    return { hour: slot.hour, title_vi: slot.title_vi, title_en: slot.title_en, body_vi: slot.body_vi, body_en: slot.body_en, revision: slot.revision || null };
  }

  function schedule() {
    return defaults.map(slot => overrides.find(item => item.hour === slot.hour) || slot);
  }

  function position(date = new Date()) {
    const shifted = new Date(date.getTime() + 7 * 3600000);
    const hour = shifted.getUTCHours();
    return { hour: Math.floor(hour / 2) * 2, day: shifted.toISOString().slice(0, 10),
      progress: ((hour % 2) * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds()) / 7200 };
  }

  async function load() {
    if (loading || saving) return;
    loading = true;
    const requestGeneration = generation;
    try {
      await HoaiCloud.ready;
      const rows = HoaiCloud.state.enabled ? await HoaiCloud.loadBroadcast() : JSON.parse(localStorage.getItem(localKey) || '[]');
      if (!Array.isArray(rows) || rows.length > 12 || new Set(rows.map(row => row.hour)).size !== rows.length) throw new Error('Lịch phát không hợp lệ.');
      const incoming = rows.map(validate);
      if (requestGeneration !== generation) return;
      const changed = JSON.stringify(incoming) !== JSON.stringify(overrides) || error;
      overrides = incoming;
      error = null;
      if (changed) window.dispatchEvent(new Event('hoai-broadcast-change'));
    } catch (failure) { if (requestGeneration === generation) error = failure; }
    finally { loading = false; }
  }

  async function save(slot, expectedRevision) {
    requireEditor();
    const clean = validate(slot);
    if (saving) throw new Error('Đang lưu lịch phát. Hãy chờ hoàn tất.');
    saving = true;
    generation++;
    try {
      if (HoaiCloud.state.enabled) {
        clean.revision = await HoaiCloud.saveBroadcast(clean, expectedRevision);
      } else {
        const saved = JSON.parse(localStorage.getItem(localKey) || '[]').map(validate);
        if ((saved.find(item => item.hour === clean.hour)?.revision || null) !== expectedRevision) throw new Error('Lịch đã thay đổi trên máy khác. Hãy mở lại khung giờ trước khi lưu.');
        clean.revision = crypto.randomUUID();
        localStorage.setItem(localKey, JSON.stringify([...saved.filter(item => item.hour !== clean.hour), clean]));
      }
      overrides = [...overrides.filter(item => item.hour !== clean.hour), clean];
      error = null;
      window.dispatchEvent(new Event('hoai-broadcast-change'));
    } finally {
      generation++;
      saving = false;
    }
  }

  return { defaults, validate, schedule, position, load, save, get error() { return error; } };
})();
