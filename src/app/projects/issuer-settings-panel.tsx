'use client';

import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_ISSUER_SETTING_KEY, type IssuerSetting, type SiteConfig } from '../../types';

type IssuerFormValues = Pick<
  SiteConfig,
  | 'issuerName'
  | 'issuerPostalCode'
  | 'issuerAddress'
  | 'issuerContact'
  | 'issuerEmail'
  | 'issuerInvoiceNumber'
  | 'issuerRepresentativeName'
  | 'issuerRepresentativeTitle'
  | 'issuerStampUrl'
  | 'bankNote'
>;

interface SaveIssuerSettingResult {
  message?: string;
  setting?: IssuerSetting;
}

const FONT_OPTIONS = [
  { id: "mincho", label: "Noto Serif JP", value: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "hina-mincho", label: "ひな明朝", value: '"Hina Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "kaisho", label: "Yuji Mai / Klee One", value: '"Yuji Mai", "Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "klee-one", label: "クレー One", value: '"Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "gyosho", label: "Yuji Syuku", value: '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "koin", label: "しっぽり明朝", value: '"Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "shippori-b1", label: "しっぽり明朝B1", value: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "tegomin", label: "ニューテゴミン", value: '"New Tegomin", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "kaisei-harunoumi", label: "解星 春の海", value: '"Kaisei HarunoUmi", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "sawarabi-mincho", label: "さわらび明朝", value: '"Sawarabi Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  { id: "sawarabi-gothic", label: "さわらびゴシック", value: '"Sawarabi Gothic", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },

  { id: "gothic", label: "Noto Sans JP", value: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "m-plus-1p", label: "M Plus 1p", value: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "kosugi-maru", label: "小杉丸", value: '"Kosugi Maru", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "kiwi-maru", label: "キウイ丸", value: '"Kiwi Maru", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "rampart-one", label: "ランパート One", value: '"Rampart One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "stick", label: "ステッキ", value: '"Stick", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "rocknroll-one", label: "ロックンロール", value: '"RocknRoll One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "reggae-one", label: "レゲエ One", value: '"Reggae One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "potta-one", label: "ポッタ One", value: '"Potta One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "yomogi", label: "よもぎフォント", value: '"Yomogi", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "palette-mosaic", label: "Palette Mosaic", value: '"Palette Mosaic", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { id: "hachi-maru-pop", label: "はちまるポップ", value: '"Hachi Maru Pop", cursive' },
  { id: "yusei-magic", label: "Yusei Magic", value: '"Yusei Magic", sans-serif' },
  { id: "seal", label: "HGS行書体 / HGS明朝B", value: '"HGS行書体", "HGS明朝B", "Kouzan", serif' },
] as const;

const LATIN_ONLY_FONT_IDS = new Set<FontOptionId>(['rampart-one', 'stick', 'rocknroll-one', 'palette-mosaic']);
const SINGLE_WEIGHT_FONT_IDS = new Set<FontOptionId>([
  'hachi-maru-pop',
  'yusei-magic',
  'rampart-one',
  'stick',
  'rocknroll-one',
  'palette-mosaic',
  'yomogi'
]);

type FontOptionId = (typeof FONT_OPTIONS)[number]['id'];
type WritingMode = 'horizontal' | 'vertical';
type StampRenderInput = {
  text: string;
  writingMode: WritingMode;
  fontId: FontOptionId;
  fontSize: number;
  fontWeight: number;
  fontWidthScale: number;
  fontHeightScale: number;
  verticalOffset: number;
};

export function IssuerSettingsPanel({
  initialSetting,
  initialValues,
  withinDialog = false
}: {
  initialSetting: IssuerSetting | null;
  initialValues?: IssuerFormValues | null;
  withinDialog?: boolean;
}) {
  const router = useRouter();
  const stampFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stampDialogOpen, setStampDialogOpen] = useState(false);
  const [form, setForm] = useState({
    issuerName: initialValues?.issuerName || initialSetting?.issuerName || '',
    issuerPostalCode: initialValues?.issuerPostalCode || initialSetting?.issuerPostalCode || '',
    issuerAddress: initialValues?.issuerAddress || initialSetting?.issuerAddress || '',
    issuerContact: initialValues?.issuerContact || initialSetting?.issuerContact || '',
    issuerEmail: initialValues?.issuerEmail || initialSetting?.issuerEmail || '',
    issuerInvoiceNumber: initialValues?.issuerInvoiceNumber || initialSetting?.issuerInvoiceNumber || '',
    issuerRepresentativeName: initialValues?.issuerRepresentativeName || initialSetting?.issuerRepresentativeName || '',
    issuerRepresentativeTitle:
      initialValues?.issuerRepresentativeTitle || initialSetting?.issuerRepresentativeTitle || '',
    issuerStampUrl: initialValues?.issuerStampUrl || initialSetting?.issuerStampUrl || '',
    bankNote: initialValues?.bankNote || initialSetting?.bankNote || ''
  });
  const [stampName, setStampName] = useState((initialValues?.issuerName || initialSetting?.issuerName || '').trim());
  const [verticalStampName, setVerticalStampName] = useState(
    (initialValues?.issuerName || initialSetting?.issuerName || '').trim()
  );
  const [writingMode, setWritingMode] = useState<WritingMode>('horizontal');
  const [fontId, setFontId] = useState<FontOptionId>('seal');
  const [previewFontId, setPreviewFontId] = useState<FontOptionId | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [fontWeight, setFontWeight] = useState(600);
  const [horizontalFontWidth, setHorizontalFontWidth] = useState(1);
  const [horizontalFontHeight, setHorizontalFontHeight] = useState(1);
  const [horizontalVerticalOffset, setHorizontalVerticalOffset] = useState(0);
  const [verticalFontWidth, setVerticalFontWidth] = useState(1);
  const [verticalFontHeight, setVerticalFontHeight] = useState(1);
  const [verticalVerticalOffset, setVerticalVerticalOffset] = useState(0);
  const [stampPreviewUrl, setStampPreviewUrl] = useState('');
  const activeFontWidth = writingMode === 'horizontal' ? horizontalFontWidth : verticalFontWidth;
  const activeFontHeight = writingMode === 'horizontal' ? horizontalFontHeight : verticalFontHeight;
  const activeVerticalOffset = writingMode === 'horizontal' ? horizontalVerticalOffset : verticalVerticalOffset;
  const activeName = writingMode === 'horizontal' ? stampName : verticalStampName;
  const displayStampText = useMemo(() => {
    const value = activeName.trim();
    return value.length > 0 ? value : '印名';
  }, [activeName]);
  const hasJapaneseChars = useMemo(() => /[ぁ-んァ-ン一-龯]/.test(displayStampText), [displayStampText]);
  const stampChars = useMemo(() => Array.from(displayStampText.replace(/\s+/g, '')), [displayStampText]);
  const stampRows = useMemo(() => buildAutoGroups(displayStampText, stampChars), [displayStampText, stampChars]);
  const stampColumns = useMemo(() => buildAutoGroups(displayStampText, stampChars), [displayStampText, stampChars]);
  const orderedStampColumns = writingMode === 'vertical' ? [...stampColumns].reverse() : stampColumns;
  const effectiveFontId = previewFontId ?? fontId;
  const fontFamily = useMemo(
    () => FONT_OPTIONS.find((option) => option.id === effectiveFontId)?.value || FONT_OPTIONS[0].value,
    [effectiveFontId]
  );
  const effectiveFontWeight = useMemo(
    () => (SINGLE_WEIGHT_FONT_IDS.has(effectiveFontId) ? 400 : fontWeight),
    [effectiveFontId, fontWeight]
  );
  const borderWidthPx = Math.min(6, Math.max(1, Math.round(500 / 200)));
  const horizontalPreviewLayout = buildHorizontalPreviewLayout(borderWidthPx, fontSize, stampRows.length);
  const verticalPreviewLayout = buildVerticalPreviewLayout(borderWidthPx, fontSize, stampColumns.length);

  async function handleStampFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('角印には画像ファイルを選択してください。');
      event.target.value = '';
      return;
    }

    try {
      const stampDataUrl = await readFileAsDataUrl(file);
      setError('');
      setForm((current) => ({ ...current, issuerStampUrl: stampDataUrl }));
    } catch {
      setError('角印画像を読み込めませんでした。別のファイルでお試しください。');
    } finally {
      event.target.value = '';
    }
  }

  function clearStampImage() {
    setForm((current) => ({ ...current, issuerStampUrl: '' }));
  }

  useEffect(() => {
    const nextName = (form.issuerName || '').trim();
    setStampName(nextName);
    setVerticalStampName(nextName);
  }, [form.issuerName]);

  useEffect(() => {
    let cancelled = false;

    async function updateStampPreview() {
      const nextPreviewUrl = await buildStampDataUrl({
        text: activeName,
        writingMode,
        fontId,
        fontSize,
        fontWeight: effectiveFontWeight,
        fontWidthScale: activeFontWidth,
        fontHeightScale: activeFontHeight,
        verticalOffset: activeVerticalOffset
      });

      if (!cancelled) {
        setStampPreviewUrl(nextPreviewUrl);
      }
    }

    void updateStampPreview();

    return () => {
      cancelled = true;
    };
  }, [
    activeFontHeight,
    activeFontWidth,
    activeVerticalOffset,
    effectiveFontWeight,
    fontId,
    fontSize,
    activeName,
    writingMode
  ]);

  function openStampDialog() {
    const nextName = (form.issuerName || '').trim();
    setStampName(nextName || stampName);
    setVerticalStampName(nextName || verticalStampName);
    setPreviewFontId(null);
    setWritingMode('horizontal');
    setStampDialogOpen(true);
  }

  async function applyGeneratedStamp() {
    const nextStampUrl =
      stampPreviewUrl ||
      (await buildStampDataUrl({
        text: activeName,
        writingMode,
        fontId,
        fontSize,
        fontWeight: effectiveFontWeight,
        fontWidthScale: activeFontWidth,
        fontHeightScale: activeFontHeight,
        verticalOffset: activeVerticalOffset
      }));
    if (!activeName.trim() || !nextStampUrl) {
      setError('角印に入れる文字を入力してください。');
      return;
    }
    setError('');
    setForm((current) => ({ ...current, issuerStampUrl: nextStampUrl }));
    setStampDialogOpen(false);
  }

  async function save() {
    setMessage('');
    setError('');

    const response = await fetch('/api/issuer-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settingKey: DEFAULT_ISSUER_SETTING_KEY,
        ...form
      })
    });

    const data = (await response.json()) as SaveIssuerSettingResult;

    if (!response.ok || !data.setting) {
      setError(data.message || `発行人情報を保存できませんでした。(${response.status})`);
      return;
    }

    setMessage('発行人情報を保存しました。請求書プレビューにも反映されます。');
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <article className={withinDialog ? undefined : 'card'}>
      {withinDialog ? null : (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            ISSUER
          </p>
          <h2>発行人情報</h2>
        </>
      )}
      <p>STEP1 まずはあなたの情報を登録しましょう</p>

      <div className="issuer-settings-grid">
        <Field label="会社名">
          <input
            value={form.issuerName}
            onChange={(event) => setForm((current) => ({ ...current, issuerName: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="郵便番号">
          <input
            value={form.issuerPostalCode}
            onChange={(event) => setForm((current) => ({ ...current, issuerPostalCode: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="電話番号">
          <input
            value={form.issuerContact}
            onChange={(event) => setForm((current) => ({ ...current, issuerContact: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="メールアドレス">
          <input
            value={form.issuerEmail}
            onChange={(event) => setForm((current) => ({ ...current, issuerEmail: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="代表者肩書き（空欄可）">
          <input
            value={form.issuerRepresentativeTitle}
            onChange={(event) =>
              setForm((current) => ({ ...current, issuerRepresentativeTitle: event.target.value }))
            }
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="代表者名">
          <input
            value={form.issuerRepresentativeName}
            onChange={(event) => setForm((current) => ({ ...current, issuerRepresentativeName: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
        <Field label="角印">
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              ref={stampFileInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden-file-input"
              onChange={(event) => void handleStampFileChange(event)}
              disabled={pending}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button-link secondary"
                onClick={openStampDialog}
                disabled={pending}
              >
                角印を作成
              </button>
              <button
                type="button"
                className="button-link secondary"
                onClick={() => stampFileInputRef.current?.click()}
                disabled={pending}
              >
                角印画像を選択
              </button>
              {form.issuerStampUrl ? (
                <button
                  type="button"
                  className="button-link secondary"
                  onClick={clearStampImage}
                  disabled={pending}
                >
                  角印を削除
                </button>
              ) : null}
            </div>
          </div>
        </Field>
        <Field label="角印プレビュー">
          <div style={{ display: 'grid', gap: 10 }}>
            {form.issuerStampUrl ? (
              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 20,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,0.82)',
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  padding: 10
                }}
              >
                <img
                  src={form.issuerStampUrl}
                  alt="角印プレビュー"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : null}
          </div>
        </Field>
        <Field label="住所" fullWidth>
          <textarea
            value={form.issuerAddress}
            onChange={(event) => setForm((current) => ({ ...current, issuerAddress: event.target.value }))}
            disabled={pending}
            style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
          />
        </Field>
        <Field label="振込先" fullWidth>
          <textarea
            value={form.bankNote}
            onChange={(event) => setForm((current) => ({ ...current, bankNote: event.target.value }))}
            disabled={pending}
            style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
          />
        </Field>
        <Field label="インボイス登録番号（空欄可）">
          <input
            value={form.issuerInvoiceNumber}
            onChange={(event) => setForm((current) => ({ ...current, issuerInvoiceNumber: event.target.value }))}
            disabled={pending}
            style={inputStyle}
          />
        </Field>
      </div>

      <div className="hero-actions" style={{ marginTop: 18 }}>
        <button className="button-link primary" type="button" onClick={() => void save()} disabled={pending}>
          {pending ? '発行人情報を保存中...' : '発行人情報を保存'}
        </button>
      </div>

      {message ? <div className="note">{message}</div> : null}
      {error ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {error}
        </div>
      ) : null}

      {stampDialogOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setStampDialogOpen(false)}>
          <div
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="角印を作成"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  STAMP
                </p>
                <h2 className="dialog-title">角印を作成</h2>
              </div>
              <button
                type="button"
                className="dialog-close-button"
                aria-label="ダイアログを閉じる"
                onClick={() => setStampDialogOpen(false)}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={writingMode === 'horizontal' ? 'button-link primary' : 'button-link secondary'}
                  onClick={() => setWritingMode('horizontal')}
                >
                  横書き
                </button>
                <button
                  type="button"
                  className={writingMode === 'vertical' ? 'button-link primary' : 'button-link secondary'}
                  onClick={() => setWritingMode('vertical')}
                >
                  縦書き
                </button>
              </div>

              {writingMode === 'horizontal' ? (
                <label className="issuer-settings-field">
                  <span className="issuer-settings-label">印名（改行で横書き2段）</span>
                  <textarea
                    value={stampName}
                    onChange={(event) => setStampName(event.target.value)}
                    placeholder="会社名など"
                    style={{ ...inputStyle, minHeight: 92, resize: 'vertical' }}
                  />
                </label>
              ) : (
                <label className="issuer-settings-field">
                  <span className="issuer-settings-label">印名（改行で縦列追加）</span>
                  <textarea
                    value={verticalStampName}
                    onChange={(event) => setVerticalStampName(event.target.value)}
                    placeholder="会社名など"
                    style={{ ...inputStyle, minHeight: 92, resize: 'vertical' }}
                  />
                </label>
              )}

              <div className="issuer-settings-grid" style={{ marginTop: 0 }}>
                <Field label="フォント">
                  <select
                    value={fontId}
                    onChange={(event) => {
                      setFontId(event.target.value as FontOptionId);
                      setPreviewFontId(null);
                    }}
                    style={inputStyle}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option
                        key={option.id}
                        value={option.id}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <RangeField
                  label={`文字サイズ ${fontSize}`}
                  value={fontSize}
                  min={8}
                  max={50}
                  step={1}
                  onChange={setFontSize}
                />
                <RangeField
                  label={`文字の太さ ${effectiveFontWeight}`}
                  value={fontWeight}
                  min={300}
                  max={900}
                  step={50}
                  onChange={setFontWeight}
                />
                <RangeField
                  label={`横幅 ${activeFontWidth.toFixed(2)}`}
                  value={activeFontWidth}
                  min={0.7}
                  max={2.5}
                  step={0.05}
                  onChange={(value) =>
                    writingMode === 'horizontal' ? setHorizontalFontWidth(value) : setVerticalFontWidth(value)
                  }
                />
                <RangeField
                  label={`高さ ${activeFontHeight.toFixed(2)}`}
                  value={activeFontHeight}
                  min={0.5}
                  max={3}
                  step={0.05}
                  onChange={(value) =>
                    writingMode === 'horizontal' ? setHorizontalFontHeight(value) : setVerticalFontHeight(value)
                  }
                />
                <RangeField
                  label={`上下位置 ${activeVerticalOffset}`}
                  value={activeVerticalOffset}
                  min={-24}
                  max={24}
                  step={1}
                  onChange={(value) =>
                    writingMode === 'horizontal'
                      ? setHorizontalVerticalOffset(value)
                      : setVerticalVerticalOffset(value)
                  }
                  fullWidth
                />
              </div>

              <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 144,
                    height: 144,
                    borderRadius: 24,
                    border: '1px solid var(--line)',
                    background: 'rgba(255,255,255,0.82)',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 12
                  }}
                >
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: 6,
                      border: `${borderWidthPx}px solid #fe0100`,
                      color: '#fe0100',
                      fontFamily,
                      fontWeight: effectiveFontWeight,
                      background: 'white'
                    }}
                  >
                    {writingMode === 'vertical' ? (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          transform: `translateY(${activeVerticalOffset}px)`
                        }}
                      >
                        {orderedStampColumns.map((column, columnIndex) => (
                          <div
                            key={`col-${columnIndex}`}
                            style={{
                              width: `${verticalPreviewLayout.columnWidth}px`,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              textAlign: 'center'
                            }}
                          >
                            {column.map((char, index) => (
                              <span
                                key={`${char}-${columnIndex}-${index}`}
                                style={{
                                  height: `${verticalPreviewLayout.innerSize / Math.max(1, column.length)}px`,
                                  fontSize: `${verticalPreviewLayout.fontSizeForRows(column.length)}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  transform: `scaleX(${activeFontWidth}) scaleY(${activeFontHeight})`,
                                  transformOrigin: 'center'
                                }}
                              >
                                {char}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          transform: `translateY(${activeVerticalOffset}px)`
                        }}
                      >
                        {stampRows.map((row, rowIndex) => (
                          <div
                            key={`row-${rowIndex}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${Math.max(1, row.length)}, 1fr)`,
                              alignItems: 'center',
                              textAlign: 'center',
                              height: `${horizontalPreviewLayout.rowHeight}px`,
                              fontSize: `${horizontalPreviewLayout.fontSizeForCols(row.length)}px`,
                              transform: `scaleY(${activeFontHeight})`,
                              transformOrigin: 'center'
                            }}
                          >
                            {row.map((char, index) => (
                              <span
                                key={`${char}-${rowIndex}-${index}`}
                                style={{
                                  display: 'block',
                                  lineHeight: 1,
                                  transform: `scaleX(${activeFontWidth}) scaleY(${horizontalPreviewLayout.scaleYForCols(row.length)})`,
                                  transformOrigin: 'center'
                                }}
                              >
                                {char}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {LATIN_ONLY_FONT_IDS.has(fontId) && hasJapaneseChars ? (
                  <p className="source-meta" style={{ margin: 0 }}>
                    この書体は日本語非対応のため、見た目は近い別フォントに置き換わります。
                  </p>
                ) : null}
                <p className="source-meta" style={{ margin: 0 }}>
                  文字数に応じて自動で折り返した四角印を作成します。
                </p>
              </div>

              <div className="hero-actions" style={{ marginTop: 4 }}>
                <button className="button-link secondary" type="button" onClick={() => setStampDialogOpen(false)}>
                  キャンセル
                </button>
                <button className="button-link primary" type="button" onClick={() => void applyGeneratedStamp()}>
                  この角印を使う
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Field({
  label,
  fullWidth = false,
  children
}: {
  label: string;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={fullWidth ? 'issuer-settings-field issuer-settings-field-full' : 'issuer-settings-field'}>
      <span className="issuer-settings-label">{label}</span>
      {children}
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fullWidth = false
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  fullWidth?: boolean;
}) {
  return (
    <Field label={label} fullWidth={fullWidth}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </Field>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  marginBottom: 0,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'white',
  font: 'inherit'
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('empty_result'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error('failed_to_read_file'));
    reader.readAsDataURL(file);
  });
}

async function buildStampDataUrl(input: StampRenderInput): Promise<string> {
  const trimmedText = String(input.text || '').trim();
  const normalized = trimmedText.replace(/\s+/g, '');
  if (!normalized) {
    return '';
  }

  if (typeof window === 'undefined') {
    return '';
  }

  await waitForFontsReady();

  const chars = Array.from(trimmedText.replace(/\s+/g, ''));
  const stampRows = buildAutoGroups(trimmedText, chars);
  const stampColumns = buildAutoGroups(trimmedText, chars);
  const orderedStampColumns = input.writingMode === 'vertical' ? [...stampColumns].reverse() : stampColumns;
  const borderWidthPx = Math.min(6, Math.max(1, Math.round(500 / 200)));
  const horizontalLayout = buildHorizontalPreviewLayout(borderWidthPx, input.fontSize, stampRows.length);
  const verticalLayout = buildVerticalPreviewLayout(borderWidthPx, input.fontSize, stampColumns.length);
  const fontFamily = resolveFontFamily(
    FONT_OPTIONS.find((option) => option.id === input.fontId)?.value || FONT_OPTIONS[0].value
  );
  const canvas = document.createElement('canvas');
  const exportSize = 192;
  const scale = exportSize / 96;
  canvas.width = exportSize;
  canvas.height = exportSize;
  const context = canvas.getContext('2d');

  if (!context) {
    return '';
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#d1002f';
  context.lineWidth = borderWidthPx * scale;
  drawRoundedRect(
    context,
    context.lineWidth / 2,
    context.lineWidth / 2,
    exportSize - context.lineWidth,
    exportSize - context.lineWidth,
    6 * scale
  );
  context.fill();
  context.stroke();

  context.fillStyle = '#d1002f';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (input.writingMode === 'vertical') {
    const innerSize = verticalLayout.innerSize * scale;
    const border = borderWidthPx * scale;
    const columnCount = Math.max(1, orderedStampColumns.length);
    const columnWidth = innerSize / columnCount;

    orderedStampColumns.forEach((column, columnIndex) => {
      const rowCount = Math.max(1, column.length);
      const cellHeight = innerSize / rowCount;
      const baseFontSize = verticalLayout.fontSizeForRows(rowCount) * scale;
      const x = border + columnWidth * (columnIndex + 0.5);

      column.forEach((char, rowIndex) => {
        if (!char) return;
        const y = border + cellHeight * (rowIndex + 0.5) + input.verticalOffset * scale;
        context.save();
        context.translate(x, y);
        context.scale(input.fontWidthScale, input.fontHeightScale);
        context.font = `${input.fontWeight} ${baseFontSize}px ${fontFamily}`;
        context.fillText(char, 0, 0);
        context.restore();
      });
    });
  } else {
    const innerSize = horizontalLayout.innerSize * scale;
    const border = borderWidthPx * scale;
    const rowHeight = horizontalLayout.rowHeight * scale;

    stampRows.forEach((row, rowIndex) => {
      const colCount = Math.max(1, row.length);
      const cellWidth = innerSize / colCount;
      const baseFontSize = horizontalLayout.fontSizeForCols(colCount) * scale;
      const scaleY = horizontalLayout.scaleYForCols(colCount) * input.fontHeightScale;
      const y = border + rowHeight * (rowIndex + 0.5) + input.verticalOffset * scale;

      row.forEach((char, colIndex) => {
        if (!char) return;
        const x = border + cellWidth * (colIndex + 0.5);
        context.save();
        context.translate(x, y);
        context.scale(input.fontWidthScale, scaleY);
        context.font = `${input.fontWeight} ${baseFontSize}px ${fontFamily}`;
        context.fillText(char, 0, 0);
        context.restore();
      });
    });
  }

  return canvas.toDataURL('image/png');
}

function splitIntoGroups(chars: string[], groupCount: number): string[][] {
  const base = Math.floor(chars.length / groupCount);
  const remainder = chars.length % groupCount;
  const groups: string[][] = [];
  let cursor = 0;

  for (let index = 0; index < groupCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    groups.push(chars.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups;
}

function buildAutoGroups(displayText: string, chars: string[]): string[][] {
  const rawLines = displayText.split(/\r?\n/);
  if (rawLines.length > 1) {
    const explicit = rawLines.map((line) => Array.from(line.replace(/\s+/g, '')));
    const hasAny = explicit.some((line) => line.length > 0);
    return hasAny ? explicit : [[displayText]];
  }

  const sourceChars = chars.length > 0 ? chars : [displayText];
  const count = Math.max(1, sourceChars.length);
  const groupCount = count <= 2 ? 1 : count <= 4 ? 2 : Math.ceil(count / 3);
  return splitIntoGroups(sourceChars, groupCount);
}

function buildHorizontalPreviewLayout(borderWidthPx: number, fontSize: number, rowCount: number) {
  const stampSizePx = 96;
  const innerSize = Math.max(1, stampSizePx - borderWidthPx * 2);
  const resolvedRowCount = Math.max(1, rowCount);
  const rowHeight = innerSize / resolvedRowCount;

  const targetRatioForCols = (cols: number) => {
    if (cols === 7) return 7;
    if (cols === 6) return 6;
    if (cols === 5) return 5;
    if (cols === 4) return 4;
    if (cols === 3) return 3;
    return 1;
  };

  const fontSizeForCols = (cols: number) => {
    const cellWidth = innerSize / Math.max(1, cols);
    const targetRatio = targetRatioForCols(cols);
    const scaleY = Math.max(0.6, Math.min(1.6, (targetRatio * cellWidth) / rowHeight));
    const fitted = Math.floor(Math.min(cellWidth, rowHeight / scaleY) * 0.95);
    return Math.max(1, Math.min(fontSize, fitted));
  };

  const scaleYForCols = (cols: number) => {
    const cellWidth = innerSize / Math.max(1, cols);
    const targetRatio = targetRatioForCols(cols);
    return Math.max(0.6, Math.min(1.6, (targetRatio * cellWidth) / rowHeight));
  };

  return { innerSize, rowHeight, fontSizeForCols, scaleYForCols };
}

function buildVerticalPreviewLayout(borderWidthPx: number, fontSize: number, columnCount: number) {
  const stampSizePx = 96;
  const innerSize = Math.max(1, stampSizePx - borderWidthPx * 2);
  const resolvedColumnCount = Math.max(1, columnCount);
  const columnWidth = innerSize / resolvedColumnCount;

  const fontSizeForRows = (rows: number) => {
    const cellHeight = innerSize / Math.max(1, rows);
    const fitted = Math.floor(Math.min(columnWidth, cellHeight) * 0.95);
    return Math.max(1, Math.min(fontSize, fitted));
  };

  return { innerSize, columnWidth, fontSizeForRows };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

async function waitForFontsReady() {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  await document.fonts.ready;
}

function resolveFontFamily(fontFamily: string): string {
  if (typeof window === 'undefined') {
    return fontFamily;
  }

  return fontFamily
    .replace(/var\((--[^)]+)\)/g, (_, variableName) => {
      const resolved = window.getComputedStyle(document.body).getPropertyValue(variableName).trim();
      return resolved || '';
    })
    .replace(/,\s*,/g, ',')
    .replace(/^,\s*|\s*,\s*$/g, '');
}
