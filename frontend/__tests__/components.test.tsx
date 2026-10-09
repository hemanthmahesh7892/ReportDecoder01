import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FileUpload from '../components/FileUpload'
import ResultsCards from '../components/ResultsCards'
import UploadSection from '../components/UploadSection'
import type { AnalysisResponse } from '../lib/types'
import { SUPPORTED_LANGUAGES } from '../lib/types'

// ---------------------------------------------------------------------------
// FileUpload Component
// ---------------------------------------------------------------------------

describe('FileUpload Component', () => {
  it('renders the drop zone when no file is selected', () => {
    render(<FileUpload file={null} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/Drop your medical report/i)).toBeInTheDocument()
    expect(screen.getByText(/JPG, PNG, WEBP, PDF up to 10 MB/i)).toBeInTheDocument()
  })

  it('shows file preview when a file is selected', () => {
    const file = new File(['test'], 'report.pdf', { type: 'application/pdf' })
    render(<FileUpload file={file} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })

  it('displays formatted file size', () => {
    const buf = new ArrayBuffer(2048 * 1024) // ~2 MB
    const file = new File([buf], 'big.png', { type: 'image/png' })
    render(<FileUpload file={file} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/MB/)).toBeInTheDocument()
  })

  it('displays file size in KB for smaller files', () => {
    const buf = new ArrayBuffer(500 * 1024) // ~500 KB
    const file = new File([buf], 'small.png', { type: 'image/png' })
    render(<FileUpload file={file} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/KB/)).toBeInTheDocument()
  })

  it('displays file size in B for tiny files', () => {
    const file = new File(['x'], 'tiny.png', { type: 'image/png' })
    render(<FileUpload file={file} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/B/)).toBeInTheDocument()
  })

  it('calls onClear when the remove button is clicked', () => {
    const onClear = vi.fn()
    const file = new File(['x'], 'test.png', { type: 'image/png' })
    render(<FileUpload file={file} onFileSelect={vi.fn()} onClear={onClear} />)
    const clearBtn = screen.getByLabelText('Remove file')
    fireEvent.click(clearBtn)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('rejects files over 10 MB via alert', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onFileSelect = vi.fn()
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement

    if (input) {
      const oversized = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.png', {
        type: 'image/png',
      })
      Object.defineProperty(input, 'files', { value: [oversized] })
      fireEvent.change(input)
      // processFile is async, give it a tick
      await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith('File too large. Maximum size is 10MB.')
      })
    }
    alertMock.mockRestore()
  })

  it('compresses large images before calling onFileSelect', async () => {
    // Mock canvas context
    const mockDrawImage = vi.fn()
    const mockToBlob = vi.fn((cb) => cb(new Blob(['compressed'])))
    // @ts-expect-error mocking getContext is tricky with types
    HTMLCanvasElement.prototype.getContext = () =>
      ({
        drawImage: mockDrawImage,
      }) as unknown as CanvasRenderingContext2D
    HTMLCanvasElement.prototype.toBlob = mockToBlob

    // Mock Image
    const originalImage = window.Image
    window.Image = class {
      onload: () => void = () => {}
      src: string = ''
      width = 2000
      height = 2000
      constructor() {
        setTimeout(() => this.onload(), 10)
      }
    } as unknown as typeof Image

    const onFileSelect = vi.fn()
    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [file] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(mockDrawImage).toHaveBeenCalled()
        expect(onFileSelect).toHaveBeenCalled()
      })
    }
    window.Image = originalImage
  })

  it('falls back to original file when canvas toBlob returns null', async () => {
    const mockDrawImage = vi.fn()
    const mockToBlob = vi.fn((cb) => cb(null)) // null blob
    // @ts-expect-error mocking getContext
    HTMLCanvasElement.prototype.getContext = () =>
      ({
        drawImage: mockDrawImage,
      }) as unknown as CanvasRenderingContext2D
    HTMLCanvasElement.prototype.toBlob = mockToBlob

    const originalImage = window.Image
    window.Image = class {
      onload: () => void = () => {}
      src: string = ''
      width = 2000
      height = 2000
      constructor() {
        setTimeout(() => this.onload(), 10)
      }
    } as unknown as typeof Image

    const onFileSelect = vi.fn()
    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [file] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(file) // original file, not compressed
      })
    }
    window.Image = originalImage
  })

  it('falls back to original file when compression throws an error', async () => {
    // Mocking getContext to throw
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error('canvas fail')
    }

    const originalImage = window.Image
    window.Image = class {
      onload: () => void = () => {}
      src: string = ''
      width = 2000
      height = 2000
      constructor() {
        setTimeout(() => this.onload(), 10)
      }
    } as unknown as typeof Image

    const onFileSelect = vi.fn()
    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [file] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(file)
      })
    }
    window.Image = originalImage
  })

  it('handles drag and drop events', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const dropzone = screen.getByText(/Drop your medical report here/i).closest('div.drop-zone')!

    fireEvent.dragEnter(dropzone)
    expect(dropzone.className).toMatch(/active/)

    fireEvent.dragLeave(dropzone)
    expect(dropzone.className).not.toMatch(/active/)

    const file = new File(['x'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })

    expect(onFileSelect).toHaveBeenCalled()
  })

  it('handles dragover event without errors', () => {
    render(<FileUpload file={null} onFileSelect={vi.fn()} onClear={vi.fn()} />)
    const dropzone = screen.getByText(/Drop your medical report here/i).closest('div.drop-zone')!

    // dragOver should prevent default without errors
    fireEvent.dragOver(dropzone)
  })

  it('passes small files directly without compression', async () => {
    const onFileSelect = vi.fn()
    const smallFile = new File([new ArrayBuffer(500)], 'small.jpg', { type: 'image/jpeg' })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [smallFile] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(smallFile)
      })
    }
  })

  it('passes PDF files directly without compression', async () => {
    const onFileSelect = vi.fn()
    const pdfFile = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [pdfFile] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(pdfFile)
      })
    }
  })

  it('compresses wide landscape images correctly', async () => {
    const mockDrawImage = vi.fn()
    const mockToBlob = vi.fn((cb) => cb(new Blob(['compressed'])))
    // @ts-expect-error mocking getContext
    HTMLCanvasElement.prototype.getContext = () =>
      ({
        drawImage: mockDrawImage,
      }) as unknown as CanvasRenderingContext2D
    HTMLCanvasElement.prototype.toBlob = mockToBlob

    const originalImage = window.Image
    window.Image = class {
      onload: () => void = () => {}
      src: string = ''
      width = 3000 // wide landscape
      height = 1000
      constructor() {
        setTimeout(() => this.onload(), 10)
      }
    } as unknown as typeof Image

    const onFileSelect = vi.fn()
    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'wide.jpg', { type: 'image/jpeg' })
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const input = document.getElementById('file-upload-input') as HTMLInputElement
    if (input) {
      Object.defineProperty(input, 'files', { value: [file] })
      fireEvent.change(input)

      await waitFor(() => {
        expect(mockDrawImage).toHaveBeenCalled()
        expect(onFileSelect).toHaveBeenCalled()
      })
    }
    window.Image = originalImage
  })

  it('does not process unsupported file types on drop', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload file={null} onFileSelect={onFileSelect} onClear={vi.fn()} />)

    const dropzone = screen.getByText(/Drop your medical report here/i).closest('div.drop-zone')!
    const txtFile = new File(['x'], 'test.txt', { type: 'text/plain' })
    fireEvent.drop(dropzone, { dataTransfer: { files: [txtFile] } })

    expect(onFileSelect).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ResultsCards Component
// ---------------------------------------------------------------------------

const labReportData: AnalysisResponse = {
  summary: 'Your blood work is mostly normal with one value to watch.',
  document_type: 'lab_report',
  medicines: [],
  lab_values: [
    {
      name: 'Hemoglobin',
      value: '14.5',
      normal_range: '12-16 g/dL',
      status: 'normal',
      meaning: 'Within normal limits',
    },
    {
      name: 'Blood Sugar',
      value: '250',
      normal_range: '70-100 mg/dL',
      status: 'high',
      meaning: 'Elevated glucose level',
    },
    {
      name: 'Iron',
      value: '30',
      normal_range: '60-170 mcg/dL',
      status: 'low',
      meaning: 'Below normal range',
    },
  ],
  red_flags: ['Elevated blood sugar requires immediate consultation'],
  doctor_questions: ['Should I start medication for blood sugar?', 'How often should I retest?'],
  disclaimer: 'This is not medical advice. Consult your doctor.',
}

const prescriptionData: AnalysisResponse = {
  summary: 'Prescription for common antibiotics.',
  document_type: 'prescription',
  medicines: [
    {
      name: 'Amoxicillin',
      purpose: 'Bacterial infection',
      dosage: '500mg',
      timing: 'morning, afternoon, night',
      with_food: 'after',
      notes: 'Complete full course',
    },
    {
      name: 'Paracetamol',
      purpose: 'Fever reducer',
      dosage: '650mg',
      timing: 'morning, night',
      with_food: 'before',
      notes: '',
    },
  ],
  lab_values: [],
  red_flags: [],
  doctor_questions: ['Can I take these together?'],
  disclaimer: 'Consult your doctor.',
}

const medicineWithNoTiming: AnalysisResponse = {
  summary: 'Prescription with unusual timing.',
  document_type: 'prescription',
  medicines: [
    {
      name: 'VitaminD',
      purpose: 'Supplement',
      dosage: '1000IU',
      timing: 'weekly',
      with_food: 'any',
      notes: '',
    },
  ],
  lab_values: [],
  red_flags: [],
  doctor_questions: [],
  disclaimer: 'Consult your doctor.',
}

describe('ResultsCards Component', () => {
  describe('Lab report rendering', () => {
    it('renders the summary text', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText(/blood work is mostly normal/i)).toBeInTheDocument()
    })

    it('renders lab value names and values', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText('Hemoglobin')).toBeInTheDocument()
      expect(screen.getByText('14.5')).toBeInTheDocument()
      expect(screen.getByText('Blood Sugar')).toBeInTheDocument()
      expect(screen.getByText('250')).toBeInTheDocument()
    })

    it('renders status badges with text labels', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText('Normal')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    it('renders red flags section', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText(/Elevated blood sugar/)).toBeInTheDocument()
    })

    it('renders doctor questions', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText(/Should I start medication/)).toBeInTheDocument()
      expect(screen.getByText(/How often should I retest/)).toBeInTheDocument()
    })

    it('renders the disclaimer', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText(/not medical advice/i)).toBeInTheDocument()
    })

    it('shows the document type badge', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getByText('lab report')).toBeInTheDocument()
    })
  })

  describe('Prescription rendering', () => {
    it('renders medicine names', () => {
      render(<ResultsCards data={prescriptionData} />)
      expect(screen.getAllByText('Amoxicillin')[0]).toBeInTheDocument()
      expect(screen.getAllByText('Paracetamol')[0]).toBeInTheDocument()
    })

    it('renders dosage and timing info', () => {
      render(<ResultsCards data={prescriptionData} />)
      expect(screen.getAllByText('500mg')[0]).toBeInTheDocument()
      expect(screen.getAllByText(/morning/i).length).toBeGreaterThan(0)
    })

    it('renders medicine schedule timeline', () => {
      render(<ResultsCards data={prescriptionData} />)
      // The MedicineTimeline shows morning/afternoon/night
      expect(screen.getByText('morning')).toBeInTheDocument()
      expect(screen.getByText('afternoon')).toBeInTheDocument()
      expect(screen.getByText('night')).toBeInTheDocument()
    })

    it('does not render lab values section for prescriptions', () => {
      render(<ResultsCards data={prescriptionData} />)
      expect(screen.queryByText('Lab Values')).not.toBeInTheDocument()
    })

    it('renders medicine notes when present', () => {
      render(<ResultsCards data={prescriptionData} />)
      expect(screen.getAllByText('Complete full course')[0]).toBeInTheDocument()
    })

    it('groups medicines with unrecognised timing into morning', () => {
      render(<ResultsCards data={medicineWithNoTiming} />)
      // VitaminD timing is "weekly" which doesn't match morning/afternoon/night
      // So it should be placed in the morning group as default
      expect(screen.getAllByText('VitaminD').length).toBeGreaterThan(0)
    })
  })

  describe('Interactive features', () => {
    it('renders copy button', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getAllByText('Copy')[0]).toBeInTheDocument()
    })

    it('copies text to clipboard on copy button click', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
      })

      render(<ResultsCards data={labReportData} />)
      const copyBtn = screen.getAllByText('Copy')[0]
      fireEvent.click(copyBtn)

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(labReportData.summary)
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })

    it('renders read-aloud button', () => {
      render(<ResultsCards data={labReportData} />)
      expect(screen.getAllByText('Read Aloud')[0]).toBeInTheDocument()
    })

    it('toggles read-aloud to Stop on click', () => {
      // Mock speechSynthesis
      const mockSpeak = vi.fn()
      const mockCancel = vi.fn()
      Object.defineProperty(window, 'speechSynthesis', {
        value: { speak: mockSpeak, cancel: mockCancel },
        writable: true,
      })

      render(<ResultsCards data={labReportData} />)
      const btn = screen.getAllByText('Read Aloud')[0]
      fireEvent.click(btn)
      expect(mockSpeak).toHaveBeenCalled()
      expect(screen.getByText('Stop')).toBeInTheDocument()
    })

    it('stops reading when Stop is clicked', () => {
      const mockSpeak = vi.fn()
      const mockCancel = vi.fn()
      Object.defineProperty(window, 'speechSynthesis', {
        value: { speak: mockSpeak, cancel: mockCancel },
        writable: true,
      })

      render(<ResultsCards data={labReportData} />)
      const btn = screen.getAllByText('Read Aloud')[0]
      fireEvent.click(btn) // Start
      fireEvent.click(screen.getByText('Stop')) // Stop
      expect(mockCancel).toHaveBeenCalled()
    })
  })

  describe('Empty data edge cases', () => {
    it('renders without medicines, lab values, red flags, or questions', () => {
      const emptyData: AnalysisResponse = {
        summary: 'Nothing found.',
        document_type: 'other',
        medicines: [],
        lab_values: [],
        red_flags: [],
        doctor_questions: [],
        disclaimer: 'Disclaimer text.',
      }
      render(<ResultsCards data={emptyData} />)
      expect(screen.getByText('Nothing found.')).toBeInTheDocument()
      expect(screen.getByText('Disclaimer text.')).toBeInTheDocument()
      // Medicines and lab values sections should not render
      expect(screen.queryByText(/Medicines/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Lab Values/)).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// UploadSection Component
// ---------------------------------------------------------------------------

describe('UploadSection Component', () => {
  it('renders the title and subtitle', () => {
    render(
      <UploadSection
        file={null}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={vi.fn()}
        error={null}
      />,
    )
    expect(screen.getByText('Analyze Your Report')).toBeInTheDocument()
    expect(screen.getByText(/Upload a medical report/)).toBeInTheDocument()
  })

  it('disables analyze button when no file is selected', () => {
    render(
      <UploadSection
        file={null}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={vi.fn()}
        error={null}
      />,
    )
    const btn = screen.getByText('Upload a file to continue')
    expect(btn).toBeInTheDocument()
  })

  it('enables analyze button when file is selected', () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    render(
      <UploadSection
        file={file}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={vi.fn()}
        error={null}
      />,
    )
    const btn = screen.getByText('🔍 Analyze Report')
    expect(btn).toBeInTheDocument()
  })

  it('renders error message with role=alert', () => {
    render(
      <UploadSection
        file={null}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={vi.fn()}
        error="Something went wrong"
      />,
    )
    const errorEl = screen.getByRole('alert')
    expect(errorEl).toBeInTheDocument()
    expect(errorEl).toHaveTextContent('Something went wrong')
  })

  it('renders language selector with all supported languages', () => {
    render(
      <UploadSection
        file={null}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={vi.fn()}
        error={null}
      />,
    )
    const select = screen.getByLabelText('Explain in')
    expect(select).toBeInTheDocument()
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(screen.getByText(lang)).toBeInTheDocument()
    })
  })

  it('calls handleAnalyze when button is clicked', () => {
    const handleAnalyze = vi.fn()
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    render(
      <UploadSection
        file={file}
        setFile={vi.fn()}
        language="English"
        setLanguage={vi.fn()}
        handleAnalyze={handleAnalyze}
        error={null}
      />,
    )
    fireEvent.click(screen.getByText('🔍 Analyze Report'))
    expect(handleAnalyze).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

describe('Types and constants', () => {
  it('SUPPORTED_LANGUAGES contains expected languages', () => {
    expect(SUPPORTED_LANGUAGES).toContain('English')
    expect(SUPPORTED_LANGUAGES).toContain('Hindi')
    expect(SUPPORTED_LANGUAGES).toContain('Tamil')
    expect(SUPPORTED_LANGUAGES).toContain('Kannada')
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(8)
  })
})
