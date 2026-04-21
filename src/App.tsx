import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, Calculator, History as HistoryIcon, Edit2, Check, Clock } from 'lucide-react';
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
    // Allow digits, decimal point, and basic math operators
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

export default function App() {
  const [rates, setRates] = useState<Rates>(() => {
    const saved = localStorage.getItem('app_rates');
    return saved ? JSON.parse(saved) : { USD: 1, UYU: 40, COP: 4000 };
  });
  
  const [lastUpdate, setLastUpdate] = useState<string>(() => {
    return localStorage.getItem('app_last_update') || 'Nunca';
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
            if (cooldown === 0) setCooldown(10); // allow retry sooner if failed
          });
      });
  }, [cooldown]);

  useEffect(() => {
    // Initial fetch if we have no valid cooldown
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
      return [newEntry, ...prev].slice(0, 10); // Keep last 10
    });
  };

  const handleInput = (currency: Currency, val: string) => {
    // Basic validation: allow math characters
    if (val !== '' && !/^[\d\.\+\-\*\/\(\) ]+$/.test(val)) return;

    if (val === '') {
      setValues({ USD: '', UYU: '', COP: '' });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    const numVal = safeEval(val);
    
    // Clear timeout unconditionally
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (isNaN(numVal)) {
      // Just visually update the field with invalid math, but don't convert others
      setValues(prev => ({ ...prev, [currency]: val }));
      return;
    }

    const baseUsd = numVal / rates[currency];

    const formatToTwoDecimalPlaces = (num: number) => {
      return parseFloat(num.toFixed(2)).toString();
    };

    setValues({
      [currency]: val, // Keep exact typed text (e.g. "10+20") for active field
      USD: currency === 'USD' ? val : formatToTwoDecimalPlaces(baseUsd * rates.USD),
      UYU: currency === 'UYU' ? val : formatToTwoDecimalPlaces(baseUsd * rates.UYU),
      COP: currency === 'COP' ? val : formatToTwoDecimalPlaces(baseUsd * rates.COP),
    });

    // Save to history after 1.5s of no typing using the evaluated result
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
    // Apply old rates temporarily? Or just convert with current rates.
    // Usually it's better to convert with current rates
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
      // Recalculate current values based on active field
      // We'll just recalculate from whatever the first non-empty value is
      let active: Currency | null = null;
      if (values.USD) active = 'USD';
      else if (values.COP) active = 'COP';
      else if (values.UYU) active = 'UYU';
      
      if (active) handleInput(active, values[active]);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#f0f0f0] flex items-center justify-center p-4 selection:bg-white/20 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#141414]/80 border border-white/10 backdrop-blur-md rounded-[32px] p-6 sm:p-12 shadow-2xl w-full max-w-[640px] relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between mb-8 sm:mb-12 gap-6 leading-none">
          <h1 className="text-3xl sm:text-2xl font-light tracking-tight flex items-center gap-3">
            Converti<span className="font-semibold">dor</span>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
              title="Historial"
            >
              <HistoryIcon className="w-5 h-5" />
            </button>
          </h1>
          <div className="w-full sm:w-auto bg-white/5 sm:bg-transparent rounded-2xl p-4 sm:p-0 border border-white/5 sm:border-none text-center sm:text-right group">
             {loading && cooldown === 0 ? (
              <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 animate-pulse">Cargando tasas...</p>
            ) : (
              <>
                <div className="flex items-center justify-center sm:justify-end gap-2 mb-3 sm:mb-2 text-[10px] uppercase tracking-widest text-white/40">
                  <span>Cambio actual (Ud: {lastUpdate})</span>
                  <button 
                    onClick={() => setEditingRates(!editingRates)} 
                    className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white transition-colors"
                    title="Ajuste manual"
                  >
                    {editingRates ? <Check className="w-3 h-3 text-emerald-400" /> : <Edit2 className="w-3 h-3" />}
                  </button>
                </div>

                {editingRates ? (
                  <div className="flex sm:block justify-center gap-x-2 gap-y-1 flex-wrap text-sm sm:text-xs font-mono text-emerald-400/80 leading-relaxed">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span>1 USD = </span>
                      <input 
                        type="number" 
                        defaultValue={rates.UYU.toFixed(2)} 
                        onBlur={(e) => updateManualRate('UYU', e.target.value)}
                        className="bg-black/50 border border-white/20 rounded px-2 py-0.5 w-20 text-right outline-none focus:border-emerald-400 text-white"
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
                        className="bg-black/50 border border-white/20 rounded px-2 py-0.5 w-20 text-right outline-none focus:border-emerald-400 text-white"
                        step="1"
                      />
                      <span>COP</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex sm:block justify-center gap-x-2 gap-y-1 flex-wrap text-sm sm:text-xs font-mono text-emerald-400/80 leading-relaxed">
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
          />
        </div>

        <div className="mt-12 flex justify-center items-center">
          <button
            onClick={fetchRates}
            disabled={loading || cooldown > 0}
            className="group flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[11px] uppercase tracking-widest text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-white/60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando...' : cooldown > 0 ? `Esperar ${cooldown}s` : 'Actualizar Tasas Web'}
          </button>
        </div>

        {/* History Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-y-0 left-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-white/10 p-6 z-50 flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-medium tracking-wide uppercase text-white/60">Historial reciente</h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {history.length === 0 ? (
                  <p className="text-xs text-center text-white/30 mt-10">Sin historial</p>
                ) : (
                  history.map((h) => {
                    const dt = new Date(h.timestamp);
                    const isMath = h.amount.toString() !== h.amount.toString(); // Wait, amount is evaled. Let's just show evaluated amt
                    return (
                      <button
                        key={h.id}
                        onClick={() => loadHistoryItem(h)}
                        className="w-full text-left p-4 bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl transition-all group"
                      >
                       <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-mono text-emerald-400/80">{h.amount.toLocaleString('es-UY')} {h.from}</span>
                         <div className="flex items-center gap-1 text-[10px] text-white/30">
                           <Clock className="w-3 h-3" />
                           {dt.getHours()}:{dt.getMinutes().toString().padStart(2, '0')}
                         </div>
                       </div>
                       <div className="text-[10px] text-white/40 flex justify-between">
                         <span>1 USD = {h.rates.UYU.toFixed(1)} {h.rates.COP.toFixed(0)}</span>
                         <span className="group-hover:text-emerald-400/80 transition-colors">Volver a cargar &rarr;</span>
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
  onQuickAmount
}: CurrencyInputProps) {
  
  const hasMath = value?.includes('+') || value?.includes('-') || value?.includes('*') || value?.includes('/');
  const numericValue = safeEval(value);
  const isValidMath = !isNaN(numericValue);
  const isFilled = value && value !== '';
  
  const rounded = isValidMath ? roundSmart(numericValue, code as Currency) : NaN;
  const showRounded = isValidMath && isFilled && !hasMath && Math.abs(rounded - numericValue) > 0.01;

  return (
    <div className="relative group">
      <div className="flex justify-between items-end mb-2">
        <label htmlFor={id} className="block text-xs uppercase tracking-widest text-white/40">
          {label}
        </label>
        
        {/* Quick Amount Pills */}
        {quickAmounts && onQuickAmount && (
          <div className="flex gap-2">
            {quickAmounts.map(amt => (
              <button
                key={amt}
                onClick={() => onQuickAmount(amt)}
                className="text-[10px] font-mono px-2 py-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 rounded-full border border-white/5 transition-colors"
              >
                +{amt >= 1000 ? `${amt/1000}k` : amt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`flex items-center gap-4 border-b pb-2 transition-colors ${hasMath ? 'border-emerald-500/50 focus-within:border-emerald-400' : 'border-white/10 focus-within:border-white/40'}`}>
        <span className="text-2xl sm:text-3xl font-light text-white/20 min-w-8">{symbol}</span>
        
        <div className="flex-1 relative flex items-center">
          {hasMath && (
            <Calculator className="absolute -left-6 w-4 h-4 text-emerald-400/50" />
          )}
          <input
            id={id}
            ref={inputRef}
            type="text" // changed from number to allow math string
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-[2.5rem] sm:text-[3.5rem] leading-none font-light tracking-tight text-white placeholder:text-white/10"
          />
        </div>

        <button
          onClick={onClear}
          className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-all duration-200 hover:bg-white/10 hover:scale-105 active:scale-95 text-white cursor-pointer"
          aria-label="Limpiar base"
          title="Limpiar"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Smart Rounding / Math Evaluation Suggestion badge */}
      <div className="h-6 mt-1 flex justify-end">
        <AnimatePresence>
          {showRounded && (
            <motion.div
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-[10px] uppercase tracking-widest text-emerald-400/70 mr-16"
            >
              Cerrado: {rounded.toLocaleString('es-UY')}
            </motion.div>
          )}
          
          {isValidMath && hasMath && isFilled && (
            <motion.div
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-[10px] uppercase tracking-widest text-emerald-400 mr-16 flex items-center gap-1"
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
