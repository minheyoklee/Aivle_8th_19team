import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Layers,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";

type PartKey = "door" | "bumper" | "headlamp" | "taillamp" | "radiator";

type Detection = {
  cls: number;
  name: string;
  conf: number;
  bbox: [number, number, number, number];
};

type BodyResult = {
  part: PartKey;
  pass_fail: "PASS" | "FAIL";
  detections: Detection[];
  original_image_url?: string | null;
  result_image_url?: string | null;
  error?: string;

  source?: string;
  sequence?: { index_next: number; count: number };
};

type BatchResponse = {
  results: Record<PartKey, BodyResult | null | any>;
};

const API_BASE = "http://localhost:8000";

// ✅ 프레스처럼 5초 폴링
const POLL_MS = 5000;

const PARTS: { key: PartKey; label: string }[] = [
  { key: "door", label: "도어" },
  { key: "bumper", label: "범퍼" },
  { key: "headlamp", label: "헤드램프" },
  { key: "taillamp", label: "테일램프" },
  { key: "radiator", label: "라디에이터" },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function joinUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

function nowHHMMSS() {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}`;
}

function Badge({ value }: { value: "PASS" | "FAIL" }) {
  const isPass = value === "PASS";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold border",
        isPass
          ? "bg-emerald-50 border-emerald-200 text-black"
          : "bg-red-50 border-red-200 text-black"
      )}
    >
      {isPass ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
      ) : (
        <XCircle className="w-4 h-4 text-red-600" />
      )}
      {value}
    </span>
  );
}

export function BodyAssemblyDashboard() {
  const [conf, setConf] = useState<number>(0.25);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<Partial<Record<PartKey, BodyResult | null>>>(
    {}
  );
  const [lastUpdated, setLastUpdated] = useState<string>("--:--:--");

  // 겹침 방지
  const inFlightRef = useRef(false);

  const stats = useMemo(() => {
    const vals = Object.values(results).filter(Boolean) as BodyResult[];
    const inspected = vals.length;
    const fails = vals.filter((r) => r.pass_fail === "FAIL").length;
    const passes = vals.filter((r) => r.pass_fail === "PASS").length;
    const dets = vals.reduce((acc, r) => acc + (r.detections?.length ?? 0), 0);
    return { inspected, passes, fails, dets };
  }, [results]);

  const resetAll = () => {
    setResults({});
    setError(null);
    setLastUpdated("--:--:--");
  };

  const fetchAutoBatch = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("conf", String(conf));

      const res = await fetch(`${API_BASE}/api/v1/smartfactory/body/inspect/batch/auto`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${t || res.statusText}`);
      }

      const data: BatchResponse = await res.json();
      setResults((data.results ?? {}) as any);
      setLastUpdated(nowHHMMSS());
    } catch (e: any) {
      setError(e?.message ?? "자동 배치 분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  // ✅ 5초 폴링 (프레스처럼)
  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      await fetchAutoBatch();
    };

    tick(); // 최초 1회
    const t = window.setInterval(tick, POLL_MS);

    return () => {
      mounted = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf]); // conf 바꾸면 새 주기로 다시 시작(원하면 []로 고정 가능)

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="p-8">
        {/* Header (프레스 스타일) */}
        <div className="flex items-center justify-between mb-8 border-b border-black/10 pb-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <Car className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-black">
                차체 조립 검사 대시보드
              </h1>
              <p className="text-black text-sm mt-1">
                샘플 이미지 자동 투입(배치) · 5초마다 PASS/FAIL + 결함 위치 표시
              </p>
              <p className="text-xs text-black/60 mt-1">
                Polling: {POLL_MS / 1000}s · last update{" "}
                <span className="font-mono">{lastUpdated}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="px-3 py-2 rounded-xl bg-white border border-black/15 text-black">
              상태:{" "}
              <span className={cn("font-semibold", loading ? "text-amber-700" : "text-emerald-700")}>
                {loading ? "요청 중" : "수신 대기/완료"}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-white border border-black/15 text-black">
              FAIL <span className="font-semibold text-red-600">{stats.fails}</span> · PASS{" "}
              <span className="font-semibold text-emerald-700">{stats.passes}</span>
            </div>

            <button
              onClick={fetchAutoBatch}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-black/5 border border-black/15 text-black transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              즉시 갱신
            </button>

            <button
              onClick={resetAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-black/5 border border-black/15 text-black transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              화면 초기화
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-white border border-black/15 px-3 py-2">
            <span className="text-xs text-black/70">Confidence</span>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={conf}
              onChange={(e) => setConf(parseFloat(e.target.value || "0.25"))}
              className="w-24 rounded-lg bg-white px-2 py-1 text-sm border border-black/15 outline-none"
            />
            <span className="text-xs text-black/50">(0~1)</span>
          </div>

          <div className="rounded-xl bg-white border border-black/15 px-3 py-2 text-xs text-black/70">
            검사됨 <span className="font-semibold text-black">{stats.inspected}</span> · 총 탐지{" "}
            <span className="font-semibold text-black">{stats.dets}</span>
          </div>

          {error && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-black border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              {error}
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Parts */}
          <div className="col-span-12">
            <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
              <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 text-black">
                  <Layers className="w-4 h-4 text-blue-600" />
                  부품별 검사 결과 (Auto Batch)
                </h3>
                <span className="text-xs px-2 py-1 rounded-lg bg-white border border-black/10 text-black">
                  Live
                </span>
              </div>

              <div className="px-6 pb-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {PARTS.map((p) => {
                    const r = results[p.key] as BodyResult | null | undefined;

                    return (
                      <div key={p.key} className="rounded-2xl border border-black/10 bg-white shadow-sm">
                        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-black">{p.label}</div>
                            <div className="text-xs text-black/60">
                              샘플 폴더에서 자동 입력 → PASS/FAIL 판정
                            </div>
                          </div>

                          {r?.pass_fail && !r.error && <Badge value={r.pass_fail} />}
                          {r?.error && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-black border border-red-200">
                              <AlertTriangle className="w-4 h-4 text-red-600" />
                              ERROR
                            </span>
                          )}
                        </div>

                        <div className="px-5 pb-5">
                          {/* images */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
                              <div className="px-3 py-2 text-xs text-black/70 border-b border-black/10">
                                원본
                              </div>
                              {r?.original_image_url ? (
                                <img
                                  src={joinUrl(r.original_image_url)}
                                  alt={`${p.key}-original`}
                                  className="w-full h-44 object-contain bg-white"
                                />
                              ) : (
                                <div className="h-44 grid place-items-center text-sm text-black/50">
                                  아직 수신 전
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
                              <div className="px-3 py-2 text-xs text-black/70 border-b border-black/10">
                                결과(Annot)
                              </div>
                              {r?.result_image_url ? (
                                <img
                                  src={joinUrl(r.result_image_url)}
                                  alt={`${p.key}-result`}
                                  className="w-full h-44 object-contain bg-white"
                                />
                              ) : (
                                <div className="h-44 grid place-items-center text-sm text-black/50">
                                  아직 수신 전
                                </div>
                              )}
                            </div>
                          </div>

                          {/* detections */}
                          <div className="mt-4 rounded-2xl border border-black/10 bg-white">
                            <div className="px-4 py-3 flex items-center justify-between border-b border-black/10">
                              <div className="text-sm font-semibold text-black">탐지 결과</div>
                              {r?.detections && !r.error && (
                                <div className="text-xs text-black/60">
                                  detections:{" "}
                                  <span className="font-semibold text-black">
                                    {r.detections.length}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="p-4">
                              {!r ? (
                                <div className="text-sm text-black/60">데이터 수신 대기 중...</div>
                              ) : r.error ? (
                                <div className="text-sm text-red-600">{r.error}</div>
                              ) : (r.detections?.length ?? 0) === 0 ? (
                                <div className="text-sm text-emerald-700">
                                  결함 탐지 없음 (PASS)
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-sm">
                                    <thead className="text-xs text-black/60">
                                      <tr>
                                        <th className="py-2">Class</th>
                                        <th className="py-2">Conf</th>
                                        <th className="py-2">BBox</th>
                                      </tr>
                                    </thead>
                                    <tbody className="text-black">
                                      {r.detections.map((d, idx) => (
                                        <tr key={idx} className="border-t border-black/10">
                                          <td className="py-2">
                                            <div className="font-semibold">{d.name}</div>
                                            <div className="text-xs text-black/50">#{d.cls}</div>
                                          </td>
                                          <td className="py-2 font-mono">{d.conf}</td>
                                          <td className="py-2 text-xs text-black/70 font-mono">
                                            [{d.bbox.join(", ")}]
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* auto debug */}
                              {r?.source && (
                                <div className="mt-3 text-xs text-black/50">
                                  source: <span className="text-black/70">{r.source}</span>
                                  {r.sequence && (
                                    <span className="ml-2 text-black/50">
                                      (next: {r.sequence.index_next} / {r.sequence.count})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 text-xs text-black/50">
                  * 백엔드는 <span className="text-black/70">body_assembly/samples</span> 폴더의 이미지를
                  순차 사용합니다. (5초마다 배치 자동 요청)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BodyAssemblyDashboard;
