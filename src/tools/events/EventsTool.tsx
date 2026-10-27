import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  entryTotal,
  eventTotal,
  memberTotal,
  mergeEvents,
  newId,
  noteTotals,
  normalizeEvents,
} from "./logic";
import type { Entry, EventNote, Member } from "./logic";
import { pull, push } from "./sync";
import { download, readTextFile } from "../../shared/lib/browser";

type Sync = "saved" | "saving" | "error" | "offline";
const SYNC_TEXT: Record<Sync, string> = {
  saved: "· Đã lưu lên server",
  saving: "· Đang lưu…",
  error: "· Chưa lưu được lên server, sẽ thử lại khi có thay đổi",
  offline: "· Không kết nối được server, dữ liệu sẽ không được lưu",
};

const safeName = (n: string) =>
  n.replace(/[\\/:*?"<>|]+/g, "_").trim() || "note";
const fileNote = (name: string) => name.replace(/\.txt$/i, "");

// Mỗi thành viên là một ô thu gọn: nút Upload / Xóa chỉ hiện khi mở ra, tránh bấm nhầm
function MemberRow({
  m,
  eventName,
  open,
  onToggle,
  onChange,
  onRemove,
  toast,
}: {
  m: Member;
  eventName: string;
  open: boolean;
  onToggle: () => void;
  onChange: (entries: Entry[]) => void;
  onRemove: () => void;
  toast: (s: string) => void;
}) {
  const patchEntry = (id: string, patch: Partial<Entry>) =>
    onChange(m.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    try {
      const texts = await Promise.all(files.map(readTextFile));
      const added = files
        .map(
          (f, i): Entry => ({
            id: newId(),
            note: fileNote(f.name),
            text: texts[i].replace(/\s+$/, ""),
          }),
        )
        .filter((x) => x.text);
      if (!added.length) return toast("File rỗng");
      onChange([...m.entries, ...added]);
      toast(
        `Đã thêm ${added.length} mục vào ${m.name}, hãy sửa ghi chú nếu cần`,
      );
    } catch (err) {
      toast("Không đọc được file. Hãy chọn file .txt");
    }
  };
  const downloadAll = () => {
    const text = m.entries
      .map((x) => x.text.replace(/\s+$/, ""))
      .filter(Boolean)
      .join("\n");
    if (!text) return toast("Chưa có nội dung để tải");
    download(safeName(`${eventName}_${m.name}`) + ".txt", text);
  };
  const removeEntry = (x: Entry) => {
    if (
      window.confirm(
        `Xóa mục "${x.note || "chưa ghi chú"}" (${entryTotal(x)} dòng)? Không hoàn tác được.`,
      )
    )
      onChange(m.entries.filter((e) => e.id !== x.id));
  };
  const remove = () => {
    if (
      window.confirm(
        `Xóa "${m.name}" (${memberTotal(m)} dòng)? Không hoàn tác được.`,
      )
    )
      onRemove();
  };
  return (
    <div className={"en-m" + (open ? " open" : "")}>
      <div className="en-m-h">
        <button
          type="button"
          className="en-m-t"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="en-chev" aria-hidden="true">
            ▶
          </span>
          <b title={m.name}>{m.name}</b>
          <span className="en-tag">{memberTotal(m)} dòng</span>
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={memberTotal(m) === 0}
          onClick={downloadAll}
        >
          Tải file
        </button>
      </div>
      {open && (
        <div className="en-m-b">
          <div className="en-m-act">
            <label className="btn sm teal" style={{ cursor: "pointer" }}>
              Upload .txt
              <input
                type="file"
                accept=".txt,text/plain"
                multiple
                hidden
                onChange={upload}
              />
            </label>
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                onChange([...m.entries, { id: newId(), note: "", text: "" }])
              }
            >
              + Nhập text
            </button>
            <span className="sp" />
            <button
              type="button"
              className="btn sm ghost danger"
              onClick={remove}
            >
              Xóa người
            </button>
          </div>
          {m.entries.length === 0 && (
            <p className="dim" style={{ margin: "10px 0 0" }}>
              Chưa có mục nào. Upload file hoặc bấm + Nhập text.
            </p>
          )}
          {m.entries.map((x) => (
            <div key={x.id} className="en-e">
              <div className="en-e-h">
                <input
                  className="inp"
                  type="text"
                  placeholder="Ghi chú, vd. note A"
                  aria-label="Ghi chú"
                  value={x.note}
                  onChange={(e) => patchEntry(x.id, { note: e.target.value })}
                />
                <span className="en-tag">{entryTotal(x)} dòng</span>
                <button
                  type="button"
                  className="btn sm ghost danger"
                  aria-label="Xóa mục"
                  onClick={() => removeEntry(x)}
                >
                  Xóa
                </button>
              </div>
              <textarea
                className="ta-pane"
                spellCheck={false}
                aria-label={"Nội dung " + (x.note || m.name)}
                placeholder="Nhập text, mỗi dòng một mục…"
                value={x.text}
                onChange={(e) => patchEntry(x.id, { text: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventsTool({ toast }: { toast: (m: string) => void }) {
  const [events, setEvents] = useState<EventNote[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<Sync>("saved");
  const eRef = useRef(events);
  eRef.current = events;
  const rev = useRef(0);
  const online = useRef(false);
  const synced = useRef<EventNote[]>([]); // bản đã chắc chắn có trên server
  const busy = useRef(false);

  const adopt = useCallback((r: { rev: number; events: EventNote[] }) => {
    const events = normalizeEvents(r.events);
    rev.current = r.rev;
    synced.current = events;
    setEvents(events);
    setSelectedId((cur) =>
      events.some((e) => e.id === cur) ? cur : (events[0]?.id ?? ""),
    );
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pull()
      .then((r) => {
        online.current = true;
        if (r) adopt(r);
        setSync("saved");
        setReady(true);
      })
      .catch(() => {
        setSync("offline");
        setReady(true);
      });
  }, [adopt]);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (;;) {
        const cur = eRef.current;
        if (cur === synced.current) {
          setSync("saved");
          break;
        }
        setSync("saving");
        const r = await push(rev.current, cur);
        if (r.ok) {
          rev.current = r.rev;
          synced.current = cur;
          continue;
        }
        if (r.unauthorized) {
          window.alert(
            "Phiên đăng nhập đã hết hạn, trang sẽ tải lại để đăng nhập.",
          );
          location.reload();
          return;
        }
        if (r.conflict) {
          // người khác vừa sửa: gộp theo từng hàng rồi lưu lại ở lượt sau (effect bên dưới)
          const fresh = await pull().catch(() => null);
          if (!fresh) {
            setSync("error");
            break;
          }
          const base = synced.current,
            remote = normalizeEvents(fresh.events);
          rev.current = fresh.rev;
          synced.current = remote;
          setEvents((prev) => mergeEvents(base, prev, remote));
          break;
        }
        setSync("error");
        break;
      }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready || !online.current || events === synced.current) return;
    const t = window.setTimeout(flush, 800);
    return () => clearTimeout(t);
  }, [events, ready, flush]);

  // quay lại tab: nếu không có thay đổi chưa lưu thì lấy bản mới của người khác
  useEffect(() => {
    if (!ready) return;
    const refresh = async () => {
      if (
        document.hidden ||
        !online.current ||
        busy.current ||
        eRef.current !== synced.current
      )
        return;
      const r = await pull().catch(() => null);
      if (
        !r ||
        r.rev === rev.current ||
        busy.current ||
        eRef.current !== synced.current
      )
        return;
      adopt(r);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, adopt]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (online.current && eRef.current !== synced.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const ev = events.find((e) => e.id === selectedId) ?? null;
  const patchEvent = (id: string, f: (e: EventNote) => EventNote) =>
    setEvents((list) => list.map((e) => (e.id === id ? f(e) : e)));

  const addEvent = (f: FormEvent) => {
    f.preventDefault();
    const name = newEvent.trim();
    if (!name) return;
    const e: EventNote = { id: newId(), name, members: [] };
    setEvents((list) => [...list, e]);
    setSelectedId(e.id);
    setNewEvent("");
  };
  const renameEvent = (e: EventNote) => {
    const name = window.prompt("Tên event mới", e.name)?.trim();
    if (name) patchEvent(e.id, (x) => ({ ...x, name }));
  };
  const removeEvent = (e: EventNote) => {
    if (
      !window.confirm(
        `Xóa event "${e.name}" (${e.members.length} người, ${eventTotal(e)} dòng)? Không hoàn tác được.`,
      )
    )
      return;
    setEvents((list) => list.filter((x) => x.id !== e.id));
    if (selectedId === e.id) setSelectedId("");
  };
  const addMember = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!ev || !name) return;
    const m: Member = { id: newId(), name, entries: [] };
    patchEvent(ev.id, (x) => ({ ...x, members: [...x.members, m] }));
    setOpenIds((s) => new Set(s).add(m.id));
    setNewName("");
  };
  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  return (
    <div className="ev">
      <div className="ev-top">
        <h1>Note event</h1>
        <p className="sub">
          {" "}
          <span className="dim">{SYNC_TEXT[sync]}</span>
        </p>
      </div>
      {!ready ? (
        <div className="en-layout" role="status" aria-live="polite" aria-busy="true">
          <aside className="pane en-skel">
            <i /><i /><i />
          </aside>
          <section className="pane en-skel">
            <p className="en-loading"><span className="en-spin" aria-hidden="true" />Đang tải dữ liệu…</p>
            <i className="tall" /><i className="tall" />
          </section>
        </div>
      ) : (
        <div className="en-layout">
          <aside className="pane">
            <div className="pane-h">
              <h3>Event</h3>
            </div>
            <form className="en-pad en-add" onSubmit={addEvent}>
              <input
                className="inp"
                type="text"
                placeholder="Tên event, vd. 11-20 event LA"
                aria-label="Tên event"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
              />
              <button
                type="submit"
                className="btn teal"
                disabled={!newEvent.trim()}
              >
                + Thêm
              </button>
            </form>
            <div className="en-list">
              {events.length === 0 && (
                <p className="pane-empty">Chưa có event nào.</p>
              )}
              {events.map((e) => (
                <div
                  key={e.id}
                  className={"ev-batch" + (e.id === selectedId ? " on" : "")}
                >
                  <button
                    type="button"
                    className="ev-batch-main"
                    onClick={() => setSelectedId(e.id)}
                  >
                    <b>{e.name}</b>
                    <span className="ev-stats">
                      <span>{e.members.length} người</span>
                      <span>{eventTotal(e)} dòng</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <section className="pane">
            {!ev ? (
              <p className="pane-empty">Chọn hoặc thêm một event để bắt đầu.</p>
            ) : (
              <div className="en-pad">
                <div className="ev-head">
                  <h2>{ev.name}</h2>
                  <span className="sp" />
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => renameEvent(ev)}
                  >
                    Đổi tên
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost danger"
                    onClick={() => removeEvent(ev)}
                  >
                    Xóa event
                  </button>
                </div>
                <div className="en-total">
                  <span className="en-tag sum">Tổng {eventTotal(ev)} dòng</span>
                  <span className="en-tag">{ev.members.length} người</span>
                  {noteTotals(ev).map((t) => (
                    <span key={t.note} className="en-tag note">
                      {t.note}: {t.n}
                    </span>
                  ))}
                </div>
                <form className="en-add" onSubmit={addMember}>
                  <input
                    className="inp"
                    type="text"
                    placeholder="Tên người, vd. thinh"
                    aria-label="Tên người"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn solid"
                    disabled={!newName.trim()}
                  >
                    + Thêm
                  </button>
                </form>
                {ev.members.length === 0 && (
                  <p className="pane-empty">
                    Chưa có ai. Nhập tên rồi bấm Thêm.
                  </p>
                )}
                {ev.members.map((m) => (
                  <MemberRow
                    key={m.id}
                    m={m}
                    eventName={ev.name}
                    open={openIds.has(m.id)}
                    toast={toast}
                    onToggle={() => toggle(m.id)}
                    onChange={(entries) =>
                      patchEvent(ev.id, (x) => ({
                        ...x,
                        members: x.members.map((y) =>
                          y.id === m.id ? { ...y, entries } : y,
                        ),
                      }))
                    }
                    onRemove={() =>
                      patchEvent(ev.id, (x) => ({
                        ...x,
                        members: x.members.filter((y) => y.id !== m.id),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
