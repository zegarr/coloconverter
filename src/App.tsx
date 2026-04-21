import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, Calculator, History as HistoryIcon, Edit2, Check, Clock, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Currency = 'USD' | 'UYU' | 'COP';

interface Rates {
  USD: number;
  UYU: number;
  COP: number;
}

interface HistoryItem {
  id: string;
  from: Currency;
  amount: number;
  rates: Rates;
  timestamp: number;
}

const safeEval = (str: string): number => {
  try {
    if (!/^[\d\.\+\-\*\/\(\) ]+$/.test(str)) return NaN;
    const result = new Function(`return ${str}`)();
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
};

const roundSmart = (num: number, currency: Currency) => {
  if (currency === 'USD') return Math.round(num);
  if (currency === 'UYU') return Math.round(num / 10) * 10;
  if (currency === 'COP') return Math.round(num / 1000) * 1000;
  return Math.round(num);
};

const ACCENTS = {
  green: {
    text: 'text-emerald-600 dark:text-emerald-400',
    text80: 'text-emerald-600/80 dark:text-emerald-400/80',
    text70: 'text-emerald-600/70 dark:text-emerald-400/70',
    text50: 'text-emerald-600/50 dark:text-emerald-400/50',
    borderFocus: 'focus-within:border-emerald-600 dark:focus-within:border-emerald-400',
    borderMath: 'border-emerald-600/50 dark:border-emerald-400/50',
    borderHover: 'hover:border-emerald-600/30 dark:hover:border-emerald-400/30',
    bgHover: 'hover:bg-emerald-600/10 dark:hover:bg-emerald-400/10',
    bgCode: 'bg-emerald-500'
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    text80: 'text-blue-600/80 dark:text-blue-400/80',
    text70: 'text-blue-600/70 dark:text-blue-400/70',
    text50: 'text-blue-600/50 dark:text-blue-400/50',
    borderFocus: 'focus-within:border-blue-600 dark:focus-within:border-blue-400',
    borderMath: 'border-blue-600/50 dark:border-blue-400/50',
    borderHover: 'hover:border-blue-600/30 dark:hover:border-blue-400/30',
    bgHover: 'hover:bg-blue-600/10 dark:hover:bg-blue-400/10',
    bgCode: 'bg-blue-500'
  },
  red: {
    text: 'text-rose-600 dark:text-rose-400',
    text80: 'text-rose-600/80 dark:text-rose-400/80',
    text70: 'text-rose-600/70 dark:text-rose-400/70',
    text50: 'text-rose-600/50 dark:text-rose-400/50',
    borderFocus: 'focus-within:border-rose-600 dark:focus-within:border-rose-400',
    borderMath: 'border-rose-600/50 dark:border-rose-400/50',
    borderHover: 'hover:border-rose-600/30 dark:hover:border-rose-400/30',
    bgHover: 'hover:bg-rose-600/10 dark:hover:bg-rose-400/10',
    bgCode: 'bg-rose-500'
  },
  yellow: {
    text: 'text-amber-600 dark:text-amber-400',
    text80: 'text-amber-600/80 dark:text-amber-400/80',
    text70: 'text-amber-600/70 dark:text-amber-400/70',
    text50: 'text-amber-600/50 dark:text-amber-400/50',
    borderFocus: 'focus-within:border-amber-600 dark:focus-within:border-amber-400',
    borderMath: 'border-amber-600/50 dark:border-amber-400/50',
    borderHover: 'hover:border-amber-600/30 dark:hover:border-amber-400/30',
    bgHover: 'hover:bg-amber-600/10 dark:hover:bg-amber-400/10',
    bgCode: 'bg-amber-500'
  }
};

export default function App() {
  const [rates, setRates] = useState<Rates>(() => {
    const saved = localStorage.getItem('app_rates');
    return saved ? JSON.parse(saved) : { USD: 1, UYU: 40, COP: 4000 };
  });
  
  const [lastUpdate, setLastUpdate] = useState<string>(() => {
    return localStorage.getItem('app_last_update') || 'Nunca';
  });

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('app_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const [accentKey, setAccentKey] = useState<keyof typeof ACCENTS>(() => {
    return (localStorage.getItem('app_accent') as keyof typeof ACCENTS) || 'green';
  });

  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({ USD: '', UYU: '', COP: '' });
  const [cooldown, setCooldown] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('app_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [editingRates, setEditingRates] = useState(false);

  const usdRef = useRef<HTMLInputElement>(null);
  const uyuRef = useRef<HTMLInputElement>(null);
  const copRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem('app_dark_mode', isDark.toString());
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('app_accent', accentKey);
  }, [accentKey]);

  const curAccent = ACCENTS[accentKey];

  const fetchRates = useCallback(() => {
    setLoading(true);
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((res) => {
        if (!res.ok) throw new Error('API request failed');
        return res.json();
      })
      .then((data) => {
        const newRates = { USD: 1, UYU: data.rates.UYU, COP: data.rates.COP };
        setRates(newRates);
        localStorage.setItem('app_rates', JSON.stringify(newRates));
        const now = new Date().toLocaleTimeString();
        setLastUpdate(now);
        localStorage.setItem('app_last_update', now);
        setLoading(false);
        setCooldown(60);
      })
      .catch((err) => {
        console.error('Failed to fetch from primary, trying fallback...', err);
        fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json')
          .then(res => res.json())
          .then(data => {
            const newRates = { USD: 1, UYU: data.usd.uyu, COP: data.usd.cop };
            setRates(newRates);
            localStorage.setItem('app_rates', JSON.stringify(newRates));
            const now = new Date().toLocaleTimeString();
            setLastUpdate(now);
            localStorage.setItem('app_last_update', now);
            setLoading(false);
            setCooldown(60);
          })
          .catch(fallbackErr => {
            console.error('Failed to fetch from all sources. Using offline rates.', fallbackErr);
            setLoading(false);
            if (cooldown === 0) setCooldown(10);
          });
      });
  }, [cooldown]);

  useEffect(() => {
    if (cooldown === 0 && lastUpdate === 'Nunca') {
      fetchRates();
    } else {
      setLoading(false);
    }
  }, [fetchRates, cooldown, lastUpdate]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    localStorage.setItem('app_history', JSON.stringify(history));
  }, [history]);

  const saveToHistory = (currency: Currency, amount: number) => {
    setHistory(prev => {
      const newEntry: HistoryItem = {
        id: Date.now().toString(),
        from: currency,
        amount,
        rates: { ...rates },
        timestamp: Date.now()
      };
      return [newEntry, ...prev].slice(0, 10);
    });
  };

  const handleInput = (currency: Currency, val: string) => {
    const cleanStr = val.replace(/,/g, '');
    
    if (cleanStr !== '' && !/^[\d\.\+\-\*\/\(\) ]+$/.test(cleanStr)) return;

    if (cleanStr === '') {
      setValues({ USD: '', UYU: '', COP: '' });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    const numVal = safeEval(cleanStr);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const formatExpression = (str: string) => {
      return str.replace(/\d+(\.\d*)?/g, (match) => {
        const [int, dec] = match.split('.');
        const formattedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return dec !== undefined ? `${formattedInt}.${dec}` : formattedInt;
      });
    };

    const activeFormatted = formatExpression(cleanStr);

    if (isNaN(numVal)) {
      setValues(prev => ({ ...prev, [currency]: activeFormatted }));
      return;
    }

    const baseUsd = numVal / rates[currency];

    const formatComputed = (num: number) => {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
    };

    setValues({
      [currency]: activeFormatted,
      USD: currency === 'USD' ? activeFormatted : formatComputed(baseUsd * rates.USD),
      UYU: currency === 'UYU' ? activeFormatted : formatComputed(baseUsd * rates.UYU),
      COP: currency === 'COP' ? activeFormatted : formatComputed(baseUsd * rates.COP),
    });

    typingTimeoutRef.current = setTimeout(() => {
      saveToHistory(currency, numVal);
    }, 1500);
  };

  const handleClear = (currency: Currency) => {
    setValues({ USD: '', UYU: '', COP: '' });
    if (currency === 'USD') usdRef.current?.focus();
    if (currency === 'UYU') uyuRef.current?.focus();
    if (currency === 'COP') copRef.current?.focus();
  };

  const applyQuickAmount = (currency: Currency, amount: number) => {
    handleInput(currency, amount.toString());
  };

  const loadHistoryItem = (item: HistoryItem) => {
    handleInput(item.from, item.amount.toString());
    setShowHistory(false);
  };

  const updateManualRate = (currency: 'UYU' | 'COP', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setRates(prev => {
        const newRates = { ...prev, [currency]: num };
        localStorage.setItem('app_rates', JSON.stringify(newRates));
        return newRates;
      });
      let active: Currency | null = null;
      if (values.USD) active = 'USD';
      else if (values.COP) active = 'COP';
      else if (values.UYU) active = 'UYU';
      
      if (active) handleInput(active, values[active]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] text-gray-900 dark:text-[#f0f0f0] flex items-center justify-center p-4 selection:bg-black/10 dark:selection:bg-white/20 font-sans transition-colors duration-300">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 dark:bg-[#141414]/80 border border-black/5 dark:border-white/10 backdrop-blur-md rounded-[32px] p-6 sm:p-12 shadow-2xl shadow-gray-200/50 dark:shadow-none w-full max-w-[640px] relative overflow-hidden transition-colors duration-300"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between mb-8 sm:mb-12 gap-6 leading-none">
          <h1 className="text-3xl sm:text-2xl font-light tracking-tight flex items-center gap-3">
            Colo<span className="font-semibold">Con</span>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
              title="Historial"
            >
              <HistoryIcon className="w-5 h-5" />
            </button>
          </h1>
          <div className="w-full sm:w-auto bg-black/5 dark:bg-transparent rounded-2xl p-4 sm:p-0 border border-black/5 dark:border-none text-center sm:text-right group">
             {loading && cooldown === 0 ? (
              <p className={`text-[10px] uppercase tracking-widest ${curAccent.text80} animate-pulse`}>Cargando tasas...</p>
            ) : (
              <>
                <div className="flex items-center justify-center sm:justify-end gap-2 mb-3 sm:mb-2 text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/40">
                  <span>Cambio actual (Ud: {lastUpdate})</span>
                  <button 
                    onClick={() => setEditingRates(!editingRates)} 
                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded text-gray-400 hover:text-gray-900 dark:text-white/30 dark:hover:text-white transition-colors"
                    title="Ajuste manual"
                  >
                    {editingRates ? <Check className={`w-3 h-3 ${curAccent.text}`} /> : <Edit2 className="w-3 h-3" />}
                  </button>
                </div>

                {editingRates ? (
                  <div className={`flex sm:block justify-center gap-x-2 gap-y-1 flex-wrap text-sm sm:text-xs font-mono ${curAccent.text80} leading-relaxed`}>
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span>1 USD = </span>
                      <input 
                        type="number" 
                        defaultValue={rates.UYU.toFixed(2)} 
                        onBlur={(e) => updateManualRate('UYU', e.target.value)}
                        className={`bg-gray-100 dark:bg-black/50 border border-gray-200 dark:border-white/20 rounded px-2 py-0.5 w-20 text-right outline-none focus:border-current dark:focus:border-current ${curAccent.borderFocus} text-gray-900 dark:text-white`}
                        step="0.01"
                      />
                      <span>UYU</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span>1 USD = </span>
                      <input 
                        type="number" 
                        defaultValue={rates.COP.toFixed(0)} 
                        onBlur={(e) => updateManualRate('COP', e.target.value)}
                        className={`bg-gray-100 dark:bg-black/50 border border-gray-200 dark:border-white/20 rounded px-2 py-0.5 w-20 text-right outline-none focus:border-current dark:focus:border-current ${curAccent.borderFocus} text-gray-900 dark:text-white`}
                        step="1"
                      />
                      <span>COP</span>
                    </div>
                  </div>
                ) : (
                  <div className={`flex sm:block justify-center gap-x-2 gap-y-1 flex-wrap text-sm sm:text-xs font-mono ${curAccent.text80} leading-relaxed`}>
                    <span>1 USD = {rates.UYU.toFixed(2)} UYU</span>
                    <span className="opacity-40 sm:hidden">&bull;</span>
                    <span className="hidden sm:inline"> • </span>
                    <span>1 USD = {rates.COP.toFixed(0)} COP</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <CurrencyInput
            id="COP"
            label="Pesos Colombianos 🇨🇴"
            symbol="$"
            code="COP"
            value={values.COP}
            inputRef={copRef}
            onChange={(v) => handleInput('COP', v)}
            onClear={() => handleClear('COP')}
            quickAmounts={[10000, 50000]}
            onQuickAmount={(amt) => applyQuickAmount('COP', amt)}
            accent={curAccent}
          />
          
          <CurrencyInput
            id="UYU"
            label="Pesos Uruguayos 🇺🇾"
            symbol="$U"
            code="UYU"
            value={values.UYU}
            inputRef={uyuRef}
            onChange={(v) => handleInput('UYU', v)}
            onClear={() => handleClear('UYU')}
            quickAmounts={[500, 1000]}
            onQuickAmount={(amt) => applyQuickAmount('UYU', amt)}
            accent={curAccent}
          />
          
          <CurrencyInput
            id="USD"
            label="Dólares Americanos 🇺🇸"
            symbol="$"
            code="USD"
            value={values.USD}
            inputRef={usdRef}
            onChange={(v) => handleInput('USD', v)}
            onClear={() => handleClear('USD')}
            quickAmounts={[10, 100]}
            onQuickAmount={(amt) => applyQuickAmount('USD', amt)}
            accent={curAccent}
          />
        </div>

        {/* Action Controls Footer */}
        <div className="mt-12 pt-6 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white transition-colors"
              title={isDark ? "Modo Claro" : "Modo Oscuro"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="h-4 w-[1px] bg-black/10 dark:bg-white/10" />
            <div className="flex gap-2">
              {(Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>).map((key) => (
                <button
                  key={key}
                  onClick={() => setAccentKey(key)}
                  className={`w-5 h-5 rounded-full ${ACCENTS[key].bgCode} ring-2 ring-offset-2 dark:ring-offset-[#141414] ring-offset-white transition-all ${accentKey === key ? 'ring-current scale-110' : 'ring-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
                  style={{ color: accentKey === key ? ACCENTS[key].bgCode : 'transparent' }}
                  title={`Subtema ${key}`}
                />
              ))}
            </div>
          </div>

          <button
            onClick={fetchRates}
            disabled={loading || cooldown > 0}
            className={`group flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full text-[11px] uppercase tracking-widest text-gray-600 dark:text-white/60 transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 disabled:hover:bg-black/5 dark:disabled:hover:bg-white/5 disabled:cursor-not-allowed`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando...' : cooldown > 0 ? `Esperar ${cooldown}s` : 'Actualizar Tasas'}
          </button>
        </div>

        {/* History Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-y-0 left-0 w-80 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-black/5 dark:border-white/10 p-6 z-50 flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-medium tracking-wide uppercase text-gray-500 dark:text-white/60">Historial reciente</h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {history.length === 0 ? (
                  <p className="text-xs text-center text-gray-400 dark:text-white/30 mt-10">Sin historial</p>
                ) : (
                  history.map((h) => {
                    const dt = new Date(h.timestamp);
                    return (
                      <button
                        key={h.id}
                        onClick={() => loadHistoryItem(h)}
                        className={`w-full text-left p-4 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl transition-all group ${curAccent.borderHover} ${curAccent.bgHover}`}
                      >
                       <div className="flex justify-between items-center mb-2">
                         <span className={`text-xs font-mono font-medium ${curAccent.text80}`}>{h.amount.toLocaleString('es-UY')} {h.from}</span>
                         <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/30">
                           <Clock className="w-3 h-3" />
                           {dt.getHours()}:{dt.getMinutes().toString().padStart(2, '0')}
                         </div>
                       </div>
                       <div className="text-[10px] text-gray-500 dark:text-white/40 flex justify-between">
                         <span>1 USD = {h.rates.UYU.toFixed(1)} {h.rates.COP.toFixed(0)}</span>
                         <span className={`transition-colors ${curAccent.text80} opacity-0 group-hover:opacity-100`}>Cargar &rarr;</span>
                       </div>
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}

interface CurrencyInputProps {
  id: string;
  label: string;
  symbol: string;
  code: string;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (val: string) => void;
  onClear: () => void;
  quickAmounts?: number[];
  onQuickAmount?: (amt: number) => void;
  accent: Record<string, string>;
}

function CurrencyInput({
  id,
  label,
  symbol,
  code,
  value,
  inputRef,
  onChange,
  onClear,
  quickAmounts,
  onQuickAmount,
  accent
}: CurrencyInputProps) {
  
  const cleanValue = value ? value.replace(/,/g, '') : '';
  const hasMath = cleanValue.includes('+') || cleanValue.includes('-') || cleanValue.includes('*') || cleanValue.includes('/');
  const numericValue = safeEval(cleanValue);
  const isValidMath = !isNaN(numericValue);
  const isFilled = value && value !== '';
  
  const rounded = isValidMath ? roundSmart(numericValue, code as Currency) : NaN;
  const showRounded = isValidMath && isFilled && !hasMath && Math.abs(rounded - numericValue) > 0.01;

  return (
    <div className="relative group">
      <div className="flex justify-between items-end mb-2">
        <label htmlFor={id} className="block text-xs uppercase tracking-widest text-gray-500 dark:text-white/40">
          {label}
        </label>
        
        {quickAmounts && onQuickAmount && (
          <div className="flex gap-2">
            {quickAmounts.map(amt => (
              <button
                key={amt}
                onClick={() => onQuickAmount(amt)}
                className="text-[10px] font-mono px-2 py-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white/80 rounded-full border border-black/5 dark:border-white/5 transition-colors"
              >
                +{amt >= 1000 ? `${amt/1000}k` : amt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`flex items-center gap-4 border-b pb-2 transition-colors ${hasMath ? `${accent.borderMath} ${accent.borderFocus}` : 'border-black/5 dark:border-white/10 focus-within:border-black/20 dark:focus-within:border-white/40'}`}>
        <span className="text-2xl sm:text-3xl font-light text-gray-400 dark:text-white/20 min-w-8">{symbol}</span>
        
        <div className="flex-1 relative flex items-center">
          {hasMath && (
            <Calculator className={`absolute -left-6 w-4 h-4 ${accent.text50}`} />
          )}
          <input
            id={id}
            ref={inputRef}
            type="text" 
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-[2.5rem] sm:text-[3.5rem] leading-none font-light tracking-tight text-gray-900 dark:text-white placeholder:text-black/10 dark:placeholder:text-white/10"
          />
        </div>

        <button
          onClick={onClear}
          className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 transition-all duration-200 hover:bg-black/10 dark:hover:bg-white/10 hover:scale-105 active:scale-95 text-gray-600 dark:text-white cursor-pointer"
          aria-label="Limpiar base"
          title="Limpiar"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      <div className="h-6 mt-1 flex justify-end">
        <AnimatePresence>
          {showRounded && (
            <motion.div
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-[10px] uppercase tracking-widest ${accent.text70} mr-16`}
            >
              Cerrado: {rounded.toLocaleString('es-UY')}
            </motion.div>
          )}
          
          {isValidMath && hasMath && isFilled && (
            <motion.div
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-[10px] uppercase tracking-widest ${accent.text} mr-16 flex items-center gap-1`}
            >
              <Calculator className="w-3 h-3" />
              = {numericValue.toLocaleString('es-UY', { maximumFractionDigits: 2 })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
