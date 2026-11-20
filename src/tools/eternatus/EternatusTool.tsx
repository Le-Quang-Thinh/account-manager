import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { PageHead, SubTabs } from "../../shared/components/Layout";
import { copyText } from "../../shared/lib/browser";
import {
  addLines,
  counts,
  dateText,
  load,
  save,
  STATUS_LABEL,
  STATUS_TONE,
} from "./logic";
import type { Acc, Status } from "./logic";

type Filter = "all" | Status;

export default function EternatusTool({
  toast,
}: {
  toast: (m: string) => void;
}) {
  const [list, setList] = useState<Acc[]>(load);
  const [text, setText] = useState(""); // ô nạp account mới (nhiều dòng)
  const [note, setNote] = useState(""); // ghi chú chung cho lần nạp
  const [q, setQ] = useState(""); // ô tìm account để cập nhật
  const [filter, setFilter] = useState<Filter>("all"); // lọc theo trạng thái
  const [edit, setEdit] = useState<Acc | null>(null); // đang sửa account
  const first = useRef(true);

  // Tự lưu localStorage mỗi khi list đổi (bỏ qua lần render đầu)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    save(list);
  }, [list]);

  const c = useMemo(() => counts(list), [list]);
  const pct = c.total ? Math.round(((c.ok + c.fail) / c.total) * 100) : 0;

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return list.filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        (!k ||
          a.raw.toLowerCase().includes(k) ||
          a.note.toLowerCase().includes(k)),
    );
  }, [list, q, filter]);

  // Chọn nhiều file (.txt/.csv...): đọc hết rồi gộp nội dung vào ô nhập để xem lại trước khi nạp
  const readFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    e.target.value = ""; // reset để chọn lại cùng file vẫn kích hoạt onChange
    if (!files.length) return;
    try {
      const parts = await Promise.all(files.map((f) => f.text()));
      const chunk = parts.join("\n");
      const lines = chunk.split(/\r?\n/).filter((l) => l.trim()).length;
      setText(
        (t) =>
          (t.replace(/\s*$/, "") ? t.replace(/\s*$/, "") + "\n" : "") + chunk,
      );
      toast(
        `Đã đọc ${files.length} file (${lines} dòng). Xem lại rồi bấm Nạp vào list.`,
      );
    } catch (err) {
      toast("Không đọc được file");
    }
  };

  const addAccounts = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const r = addLines(list, text, note);
    setList(r.list);
    setText("");
    setNote("");
    if (r.added === 0)
      toast(
        r.dup
          ? "Tất cả account vừa nạp đã có trong list"
          : "Không có account nào để nạp",
      );
    else
      toast(`Đã nạp ${r.added} account${r.dup ? `, bỏ ${r.dup} trùng` : ""}`);
  };

  // Đặt trạng thái; bấm lại đúng trạng thái hiện tại thì về "chưa xử lý"
  const setStatus = (a: Acc, s: Status) => {
    const next = a.status === s ? "pending" : s;
    setList((l) =>
      l.map((x) =>
        x.id === a.id
          ? {
              ...x,
              status: next,
              doneAt: next === "pending" ? null : Date.now(),
            }
          : x,
      ),
    );
  };

  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const raw = edit.raw.trim();
    if (!raw) return;
    if (list.some((a) => a.id !== edit.id && a.raw === raw)) {
      toast("Account này đã có trong list");
      return;
    }
    setList((l) =>
      l.map((a) =>
        a.id === edit.id ? { ...edit, raw, note: edit.note.trim() } : a,
      ),
    );
    setEdit(null);
    toast("Đã lưu");
  };

  const remove = (a: Acc) => {
    if (window.confirm(`Xóa account "${a.raw}"? Không hoàn tác được.`)) {
      setList((l) => l.filter((x) => x.id !== a.id));
      if (edit?.id === a.id) setEdit(null);
    }
  };

  const clearStatus = (s: Status, label: string) => {
    const n = list.filter((a) => a.status === s).length;
    if (
      n &&
      window.confirm(
        `Xóa ${n} account ở trạng thái "${label}"? Không hoàn tác được.`,
      )
    ) {
      setList((l) => l.filter((a) => a.status !== s));
      toast(`Đã xóa ${n} account ${label}`);
    }
  };

  const copyOne = (a: Acc) =>
    copyText(a.raw).then(
      () => toast("Đã copy"),
      () => toast("Không copy được"),
    );
  const copyShown = () => {
    if (!shown.length) return;
    copyText(shown.map((a) => a.raw).join("\n")).then(
      () => toast(`Đã copy ${shown.length} account`),
      () => toast("Không copy được"),
    );
  };

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Tất cả", count: c.total },
    { id: "pending", label: "Chưa xử lý", count: c.pending },
    { id: "ok", label: "OK", count: c.ok },
    { id: "fail", label: "Fail", count: c.fail },
  ];

  return (
    <div className="etn" style={{ display: "none" }}>
      <PageHead
        title="Eternatus"
        sub="Nạp list account lên rồi đánh dấu OK / Fail cho từng cái. Dữ liệu chỉ lưu ở trình duyệt này (localStorage), không đẩy lên server."
      />

      {/* Tiến độ xử lý */}
      <div className="etn-stats">
        <div className="etn-prog">
          <div className="etn-prog-top">
            <span>Tiến độ xử lý</span>
            <b>
              {c.ok + c.fail}/{c.total} · {pct}%
            </b>
          </div>
          <div
            className="etn-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="etn-bar-ok"
              style={{ width: `${c.total ? (c.ok / c.total) * 100 : 0}%` }}
            />
            <span
              className="etn-bar-fail"
              style={{ width: `${c.total ? (c.fail / c.total) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="etn-chips">
          <span className="etn-chip tone-teal">
            OK <b>{c.ok}</b>
          </span>
          <span className="etn-chip tone-red">
            Fail <b>{c.fail}</b>
          </span>
          <span className="etn-chip tone-amber">
            Chưa xử lý <b>{c.pending}</b>
          </span>
        </div>
      </div>

      {/* Nạp account */}
      <section className="pane">
        <div className="pane-h">
          <h3>Nạp account vào list</h3>
        </div>
        <div className="en-pad">
          <form className="etn-form" onSubmit={addAccounts}>
            <textarea
              className="ta-pane"
              spellCheck={false}
              placeholder={
                "Dán account, mỗi dòng một account\nvd. user1:pass1\nuser2:pass2"
              }
              aria-label="Account cần nạp"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <input
              className="inp"
              type="text"
              placeholder="Ghi chú chung cho lần nạp này (tùy chọn)"
              aria-label="Ghi chú"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="etn-foot">
              <input
                className="file"
                type="file"
                accept=".txt,.csv,.tsv,.log"
                multiple
                aria-label="Chọn file danh sách account"
                onChange={readFiles}
              />
              <span className="dim">
                Chọn được nhiều file. Account mới vào trạng thái "Chưa xử lý";
                dòng rỗng và account đã có sẽ bị bỏ qua.
              </span>
              <span className="sp" />
              <button
                type="submit"
                className="btn sm teal"
                disabled={!text.trim()}
              >
                + Nạp vào list
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Xử lý list */}
      <section className="pane">
        <div className="pane-h">
          <h3>Xử lý list</h3>
          <div className="etn-tools">
            <input
              className="inp sm"
              type="search"
              placeholder="Tìm account để cập nhật…"
              aria-label="Tìm account"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className="btn sm"
              disabled={!shown.length}
              onClick={copyShown}
            >
              Copy ({shown.length})
            </button>
            {filter !== "all" && filter !== "pending" && (
              <button
                type="button"
                className="btn sm ghost danger"
                onClick={() => clearStatus(filter, STATUS_LABEL[filter])}
              >
                Xóa nhóm {STATUS_LABEL[filter]}
              </button>
            )}
          </div>
        </div>

        <SubTabs
          items={filters}
          value={filter}
          onChange={setFilter}
          label="Lọc theo trạng thái"
        />

        <div className="en-pad">
          {list.length === 0 && (
            <p className="pane-empty">
              List trống. Nạp account ở ô trên để bắt đầu.
            </p>
          )}
          {list.length > 0 && shown.length === 0 && (
            <p className="pane-empty">
              {q.trim()
                ? `Không có account nào khớp "${q}".`
                : "Không có account nào ở nhóm này."}
            </p>
          )}
          {shown.length > 0 && (
            <table className="nt-table etn-table">
              <thead>
                <tr>
                  <th className="c-n">#</th>
                  <th className="c-r">Account</th>
                  <th className="c-st">Trạng thái</th>
                  <th className="c-note">Ghi chú</th>
                  <th className="c-set">Cập nhật</th>
                  <th className="c-a" />
                </tr>
              </thead>
              <tbody>
                {shown.map((a, i) =>
                  edit?.id === a.id ? (
                    <tr key={a.id} className="etn-editing">
                      <td className="c-n">{i + 1}</td>
                      <td colSpan={5}>
                        <form className="etn-edit" onSubmit={saveEdit}>
                          <input
                            className="inp mono"
                            type="text"
                            autoFocus
                            aria-label="Account"
                            value={edit.raw}
                            onChange={(e) =>
                              setEdit({ ...edit, raw: e.target.value })
                            }
                          />
                          <input
                            className="inp"
                            type="text"
                            placeholder="Ghi chú"
                            aria-label="Ghi chú"
                            value={edit.note}
                            onChange={(e) =>
                              setEdit({ ...edit, note: e.target.value })
                            }
                          />
                          <button
                            type="submit"
                            className="btn sm teal"
                            disabled={!edit.raw.trim()}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setEdit(null)}
                          >
                            Hủy
                          </button>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id} className={"etn-row st-" + a.status}>
                      <td className="c-n">{i + 1}</td>
                      <td className="c-r mono" title={a.raw}>
                        {a.raw}
                      </td>
                      <td className="c-st">
                        <span className={"badge " + STATUS_TONE[a.status]}>
                          {STATUS_LABEL[a.status]}
                        </span>
                        {a.doneAt && (
                          <span className="etn-when dim">
                            {dateText(a.doneAt)}
                          </span>
                        )}
                      </td>
                      <td className="c-note" title={a.note}>
                        {a.note || <span className="dim">—</span>}
                      </td>
                      <td className="c-set">
                        <button
                          type="button"
                          className={
                            "btn sm etn-ok" + (a.status === "ok" ? " on" : "")
                          }
                          onClick={() => setStatus(a, "ok")}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className={
                            "btn sm etn-fail" +
                            (a.status === "fail" ? " on" : "")
                          }
                          onClick={() => setStatus(a, "fail")}
                        >
                          Fail
                        </button>
                      </td>
                      <td className="c-a">
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => copyOne(a)}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setEdit({ ...a })}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost danger"
                          onClick={() => remove(a)}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
