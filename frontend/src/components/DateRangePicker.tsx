import React, { useState, useRef, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

interface DateRange {
  start: string
  end: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const formatDisplayDate = (dString: string) => {
  if (!dString) return ''
  const [y, m, d] = dString.split('-')
  return `${d}/${m}/${y}`
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  // The internal state holds Date objects for easy manipulation
  const [internalStart, setInternalStart] = useState<Date | null>(value.start ? new Date(value.start + 'T12:00:00Z') : null)
  const [internalEnd, setInternalEnd] = useState<Date | null>(value.end ? new Date(value.end + 'T12:00:00Z') : null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  
  // Month being viewed
  const [viewDate, setViewDate] = useState(internalStart || new Date())

  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync internal state with props when opened
  useEffect(() => {
    if (isOpen) {
      setInternalStart(value.start ? new Date(value.start + 'T12:00:00Z') : null)
      setInternalEnd(value.end ? new Date(value.end + 'T12:00:00Z') : null)
      setViewDate(value.start ? new Date(value.start + 'T12:00:00Z') : new Date())
    }
  }, [isOpen, value])

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const days: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d))
  }

  const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const handleDayClick = (day: Date) => {
    if (!internalStart || (internalStart && internalEnd)) {
      // Start a new selection
      setInternalStart(day)
      setInternalEnd(null)
    } else if (internalStart && !internalEnd) {
      // Complete selection
      if (day < internalStart) {
        setInternalStart(day)
      } else {
        setInternalEnd(day)
      }
    }
  }

  const handleDayHover = (day: Date | null) => {
    if (internalStart && !internalEnd) {
      setHoverDate(day)
    } else {
      setHoverDate(null)
    }
  }

  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
  }

  const isHoverRange = (day: Date) => {
    if (!internalStart || internalEnd || !hoverDate) return false
    const d1 = internalStart.getTime()
    const d2 = hoverDate.getTime()
    const t = day.getTime()
    const min = Math.min(d1, d2)
    const max = Math.max(d1, d2)
    return t > min && t < max
  }

  const isSelectedRange = (day: Date) => {
    if (!internalStart || !internalEnd) return false
    const d1 = internalStart.getTime()
    const d2 = internalEnd.getTime()
    const t = day.getTime()
    const min = Math.min(d1, d2)
    const max = Math.max(d1, d2)
    return t > min && t < max
  }

  const displayString = value.start && value.end 
    ? `${formatDisplayDate(value.start)} - ${formatDisplayDate(value.end)}`
    : value.start 
      ? formatDisplayDate(value.start)
      : 'Selecionar período'

  const toDateString = (d: Date | null) => {
    if (!d) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const handleApply = () => {
    // If only start is selected, make end the same
    const end = internalEnd ? internalEnd : internalStart
    if (internalStart && end) {
      onChange({
        start: toDateString(internalStart),
        end: toDateString(end)
      })
    } else {
      onChange({ start: '', end: '' })
    }
    setIsOpen(false)
  }

  const handleClear = () => {
    setInternalStart(null)
    setInternalEnd(null)
    setHoverDate(null)
    onChange({ start: '', end: '' })
    setIsOpen(false)
  }

  return (
    <div className="dp-container" ref={popoverRef}>
      <button 
        type="button" 
        className={clsx('dp-trigger', isOpen && 'active')} 
        onClick={() => setIsOpen(!isOpen)}
        title="Filtrar por data"
      >
        <span>{displayString}</span>
        <CalendarIcon size={18} className="dp-icon" />
      </button>

      {isOpen && (
        <div className="dp-popover">
          <div className="dp-header">
            <div className="dp-month-select">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              <ChevronDown size={14} className="ml-1 text-gray-400" />
            </div>
            <div className="dp-nav">
              <button type="button" onClick={handlePrevMonth}><ChevronLeft size={16}/></button>
              <button type="button" onClick={handleNextMonth}><ChevronRight size={16}/></button>
            </div>
          </div>

          <div className="dp-grid-header">
            {DAYS_OF_WEEK.map(d => <div key={d}>{d}</div>)}
          </div>
          
          <div className="dp-grid">
            {days.map((day, i) => {
              if (!day) return <div key={i} className="dp-cell empty" />
              
              const isStart = isSameDay(day, internalStart)
              const isEnd = isSameDay(day, internalEnd)
              const isHover = isHoverRange(day)
              const isRange = isSelectedRange(day)
              
              const isSoloStart = isStart && !internalEnd && !hoverDate
              
              return (
                <div 
                  key={i} 
                  className={clsx(
                    'dp-cell',
                    isStart && 'start',
                    isEnd && 'end',
                    isSoloStart && 'start-solo',
                    isRange && 'range',
                    isHover && 'range-hover'
                  )}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => handleDayHover(day)}
                  onMouseLeave={() => handleDayHover(null)}
                >
                  <span className="dp-day-number">{day.getDate()}</span>
                </div>
              )
            })}
          </div>

          <div className="dp-time-range">
            <span className="text-sm font-semibold text-gray-700">00:00 - 23:59</span>
            <ChevronDown size={14} className="text-gray-400" />
          </div>

          <div className="dp-footer">
            <button type="button" className="dp-btn-clear" onClick={handleClear}>Limpar</button>
            <button type="button" className="dp-btn-apply" onClick={handleApply}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  )
}
