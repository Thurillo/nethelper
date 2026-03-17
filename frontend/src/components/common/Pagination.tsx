import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { clsx } from 'clsx'

interface PaginationProps {
  page: number
  pages: number
  total: number
  size: number
  onPageChange: (page: number) => void
}

const Pagination: React.FC<PaginationProps> = ({ page, pages, total, size, onPageChange }) => {
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)

  const getPageNumbers = () => {
    const nums: (number | '...')[] = []
    if (pages <= 7) {
      for (let i = 1; i <= pages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (page > 3) nums.push('...')
      for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) {
        nums.push(i)
      }
      if (page < pages - 2) nums.push('...')
      nums.push(pages)
    }
    return nums
  }

  if (pages <= 1 && total <= size) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <p className="text-sm text-gray-600">
        {total === 0 ? 'Nessun risultato' : `${from}–${to} di ${total} risultati`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Prima pagina"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Pagina precedente"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((num, i) =>
          num === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-sm text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={num}
              onClick={() => onPageChange(num as number)}
              className={clsx(
                'min-w-[32px] h-8 px-2 rounded text-sm font-medium transition-colors',
                page === num
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {num}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === pages}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Pagina successiva"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => onPageChange(pages)}
          disabled={page === pages}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Ultima pagina"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  )
}

export default Pagination
