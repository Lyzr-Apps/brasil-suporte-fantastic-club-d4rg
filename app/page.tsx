'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { callAIAgent, uploadFiles, type AIAgentResponse } from '@/lib/aiAgent'
import { useRAGKnowledgeBase } from '@/lib/ragKnowledgeBase'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineTicket,
  HiOutlineBookOpen,
} from 'react-icons/hi2'
import {
  FiSend,
  FiPaperclip,
  FiX,
  FiFilter,
  FiUpload,
  FiTrash2,
  FiChevronDown,
  FiAlertCircle,
  FiCheck,
  FiClock,
  FiArrowUp,
  FiRefreshCw,
  FiFile,
  FiInfo,
} from 'react-icons/fi'

// ---- Constants ----
const MANAGER_AGENT_ID = '699c9a94084d446e34561959'
const RETURNS_AGENT_ID = '699c9a6d11e6cd83af253887'
const COMPLAINTS_AGENT_ID = '699c9a6d948869a40a159ef8'
const ESCALATION_AGENT_ID = '699c9a8111e6cd83af25388b'
const RAG_ID = '699c9a44b45a5c2df18d8e03'

// ---- Types ----
interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  timestamp: string
  intent?: string
  agentUsed?: string
  resolutionStatus?: string
  attachments?: string[]
}

interface Ticket {
  id: string
  ticketId: string
  summary: string
  priority: string
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: string
  messages: ChatMessage[]
  estimatedResponseTime?: string
}

// ---- Agent info ----
const AGENTS_INFO = [
  { id: MANAGER_AGENT_ID, name: 'Coordenador de Atendimento', role: 'Gerente - Direciona solicitacoes' },
  { id: RETURNS_AGENT_ID, name: 'Agente de Devolucoes', role: 'Processa devolucoes e reembolsos' },
  { id: COMPLAINTS_AGENT_ID, name: 'Agente de Reclamacoes', role: 'Resolve reclamacoes de clientes' },
  { id: ESCALATION_AGENT_ID, name: 'Agente de Escalacao', role: 'Cria tickets no HubSpot' },
]

// ---- Sample data ----
const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 's1',
    role: 'agent',
    text: 'Bem-vindo ao atendimento BrazilCare! Sou seu assistente virtual. Como posso ajudar hoje?',
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 's2',
    role: 'user',
    text: 'Gostaria de devolver um produto que comprei semana passada. Pedido #12345.',
    timestamp: new Date(Date.now() - 240000).toISOString(),
  },
  {
    id: 's3',
    role: 'agent',
    text: 'Entendi! Vou verificar o pedido #12345 para iniciar o processo de devolucao.\n\n**Status:** Seu pedido esta dentro do prazo de devolucao de 30 dias.\n\n### Proximos Passos:\n1. Embale o produto na embalagem original\n2. Imprima a etiqueta de devolucao que enviaremos por e-mail\n3. Leve o pacote a uma agencia dos Correios\n\n**Prazo estimado para reembolso:** 5 a 7 dias uteis apos o recebimento.',
    timestamp: new Date(Date.now() - 180000).toISOString(),
    intent: 'RETURN',
    agentUsed: 'Returns Processing Agent',
    resolutionStatus: 'resolved',
  },
  {
    id: 's4',
    role: 'user',
    text: 'O produto veio com defeito, a tela esta trincada.',
    timestamp: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 's5',
    role: 'agent',
    text: 'Lamento muito pelo inconveniente! Produto com defeito e uma situacao que tratamos com prioridade.\n\n### Resumo da Reclamacao:\n- **Problema:** Tela trincada\n- **Severidade:** ALTA\n- **Resolucao oferecida:** Substituicao imediata\n\nVamos enviar um novo produto em ate **3 dias uteis**. Voce recebera um codigo de rastreamento por e-mail.',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    intent: 'COMPLAINT',
    agentUsed: 'Complaints Resolution Agent',
    resolutionStatus: 'resolved',
  },
]

const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'st1',
    ticketId: 'TKT-2024-001',
    summary: 'Produto com defeito - tela trincada. Cliente solicita substituicao.',
    priority: 'HIGH',
    status: 'in_progress',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    messages: [],
    estimatedResponseTime: '24 horas',
  },
  {
    id: 'st2',
    ticketId: 'TKT-2024-002',
    summary: 'Pedido nao entregue apos 15 dias. Cliente insatisfeito.',
    priority: 'URGENT',
    status: 'open',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    messages: [],
    estimatedResponseTime: '4 horas',
  },
  {
    id: 'st3',
    ticketId: 'TKT-2024-003',
    summary: 'Solicitacao de reembolso processada com sucesso.',
    priority: 'MEDIUM',
    status: 'resolved',
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    messages: [],
    estimatedResponseTime: '48 horas',
  },
]

// ---- Helpers ----
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function parseAgentResponse(result: AIAgentResponse) {
  if (!result.success) {
    return { text: result.error || 'Erro ao processar sua solicitacao. Tente novamente.', intent: '', agentUsed: '', status: 'error' }
  }
  const data = result?.response?.result || {}
  const text = data?.response || data?.message || result?.response?.message || ''
  const intent = data?.intent_classified || ''
  const agentUsed = data?.agent_used || ''
  const status = data?.resolution_status || ''
  return { text, intent, agentUsed, status }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

// ---- Markdown renderer ----
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm leading-relaxed">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// ---- Intent badge ----
function IntentBadge({ intent }: { intent: string }) {
  if (!intent) return null
  const config: Record<string, { label: string; className: string }> = {
    RETURN: { label: 'Devolucao', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    COMPLAINT: { label: 'Reclamacao', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    INQUIRY: { label: 'Consulta', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    ESCALATION: { label: 'Escalacao', className: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[intent] || { label: intent, className: 'bg-muted text-muted-foreground' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border', c.className)}>{c.label}</span>
}

// ---- Status badge ----
function StatusBadge({ status }: { status: string }) {
  if (!status) return null
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    resolved: { label: 'Resolvido', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <FiCheck className="w-3 h-3 mr-1" /> },
    pending: { label: 'Em andamento', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: <FiClock className="w-3 h-3 mr-1" /> },
    escalated: { label: 'Escalado', className: 'bg-red-100 text-red-800 border-red-200', icon: <FiArrowUp className="w-3 h-3 mr-1" /> },
    needs_info: { label: 'Precisa info', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: <FiInfo className="w-3 h-3 mr-1" /> },
    error: { label: 'Erro', className: 'bg-red-100 text-red-800 border-red-200', icon: <FiAlertCircle className="w-3 h-3 mr-1" /> },
  }
  const c = config[status] || { label: status, className: 'bg-muted text-muted-foreground', icon: null }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border', c.className)}>
      {c.icon}{c.label}
    </span>
  )
}

// ---- Ticket status badge ----
function TicketStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    open: { label: 'Aberto', className: 'bg-red-100 text-red-800 border-red-200' },
    in_progress: { label: 'Em Andamento', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    resolved: { label: 'Resolvido', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  }
  const c = config[status] || { label: status, className: 'bg-muted text-muted-foreground' }
  return <span className={cn('inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border', c.className)}>{c.label}</span>
}

// ---- Priority badge ----
function PriorityBadge({ priority }: { priority: string }) {
  if (!priority) return null
  const config: Record<string, { label: string; className: string }> = {
    URGENT: { label: 'Urgente', className: 'bg-red-600 text-white' },
    HIGH: { label: 'Alta', className: 'bg-orange-500 text-white' },
    MEDIUM: { label: 'Media', className: 'bg-amber-500 text-white' },
    LOW: { label: 'Baixa', className: 'bg-emerald-500 text-white' },
  }
  const c = config[priority] || { label: priority, className: 'bg-muted text-muted-foreground' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded', c.className)}>{c.label}</span>
}

// ---- Typing indicator ----
function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <HiOutlineChatBubbleLeftRight className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ---- ErrorBoundary ----
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Algo deu errado</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---- Main Page ----
export default function Page() {
  // Navigation
  const [activeView, setActiveView] = useState<'chat' | 'tickets' | 'kb'>('chat')

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [sessionId] = useState(() => generateId())

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ticket state
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  // Knowledge base
  const { documents, loading: kbLoading, error: kbError, fetchDocuments, uploadDocument, removeDocuments } = useRAGKnowledgeBase()
  const [kbUploading, setKbUploading] = useState(false)
  const kbFileInputRef = useRef<HTMLInputElement>(null)

  // Sample data toggle
  const [showSample, setShowSample] = useState(false)

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Scroll to bottom ref
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  // Add welcome message on mount
  const [welcomeSent, setWelcomeSent] = useState(false)
  useEffect(() => {
    if (!welcomeSent) {
      setWelcomeSent(true)
      setMessages([
        {
          id: generateId(),
          role: 'agent',
          text: 'Bem-vindo ao atendimento BrazilCare! Sou seu assistente virtual especializado. Como posso ajudar voce hoje?\n\nVoce pode digitar sua duvida ou usar os atalhos abaixo para um atendimento mais rapido.',
          timestamp: new Date().toISOString(),
        },
      ])
    }
  }, [welcomeSent])

  // Load KB docs when switching to KB view
  const [kbLoaded, setKbLoaded] = useState(false)
  useEffect(() => {
    if (activeView === 'kb' && !kbLoaded) {
      setKbLoaded(true)
      fetchDocuments(RAG_ID)
    }
  }, [activeView, kbLoaded, fetchDocuments])

  // Display messages
  const displayMessages = showSample ? SAMPLE_MESSAGES : messages
  const displayTickets = showSample ? SAMPLE_TICKETS : tickets

  // Filtered tickets
  const filteredTickets = ticketFilter === 'all' ? displayTickets : displayTickets.filter((t) => t.status === ticketFilter)

  // ---- File handling ----
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files)
    setSelectedFiles((prev) => [...prev, ...newFiles])

    newFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          setFilePreviews((prev) => [...prev, ev.target?.result as string])
        }
        reader.readAsDataURL(file)
      } else {
        setFilePreviews((prev) => [...prev, ''])
      }
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setFilePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // ---- Send message ----
  const sendMessage = async (text: string) => {
    if (!text.trim() && selectedFiles.length === 0) return
    setErrorMsg(null)

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      attachments: filePreviews.filter((p) => p),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setActiveAgentId(MANAGER_AGENT_ID)

    try {
      let assetIds: string[] = []

      // Upload files if present
      if (selectedFiles.length > 0) {
        const uploadResult = await uploadFiles(selectedFiles)
        if (uploadResult.success && Array.isArray(uploadResult.asset_ids)) {
          assetIds = uploadResult.asset_ids
        }
        setSelectedFiles([])
        setFilePreviews([])
      }

      const result = await callAIAgent(text.trim() || 'Analisar imagem anexada', MANAGER_AGENT_ID, {
        session_id: sessionId,
        ...(assetIds.length > 0 ? { assets: assetIds } : {}),
      })

      const parsed = parseAgentResponse(result)

      const agentMessage: ChatMessage = {
        id: generateId(),
        role: 'agent',
        text: parsed.text || 'Desculpe, nao consegui processar sua solicitacao. Tente novamente.',
        timestamp: new Date().toISOString(),
        intent: parsed.intent,
        agentUsed: parsed.agentUsed,
        resolutionStatus: parsed.status,
      }

      setMessages((prev) => [...prev, agentMessage])

      // If escalated, add ticket
      if (parsed.status === 'escalated' || parsed.intent === 'ESCALATION') {
        const agentData = result?.response?.result || {}
        const newTicket: Ticket = {
          id: generateId(),
          ticketId: agentData?.ticket_id || ('TKT-' + Date.now().toString(36).toUpperCase()),
          summary: agentData?.summary || text.trim(),
          priority: agentData?.priority || 'MEDIUM',
          status: 'open',
          createdAt: new Date().toISOString(),
          messages: [userMessage, agentMessage],
          estimatedResponseTime: agentData?.estimated_response_time || '24 horas',
        }
        setTickets((prev) => [...prev, newTicket])
      }
    } catch {
      setErrorMsg('Erro de conexao. Verifique sua internet e tente novamente.')
    } finally {
      setIsLoading(false)
      setActiveAgentId(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleQuickAction = (action: string) => {
    sendMessage(action)
  }

  // ---- KB Upload ----
  const handleKbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setKbUploading(true)
    await uploadDocument(RAG_ID, file)
    setKbUploading(false)
    if (kbFileInputRef.current) kbFileInputRef.current.value = ''
  }

  const handleKbDelete = async (fileName: string) => {
    await removeDocuments(RAG_ID, [fileName])
  }

  // ---- Quick actions ----
  const quickActions = [
    { label: 'Iniciar Devolucao', message: 'Gostaria de iniciar o processo de devolucao de um produto.' },
    { label: 'Registrar Reclamacao', message: 'Preciso registrar uma reclamacao sobre um produto ou servico.' },
    { label: 'Status do Pedido', message: 'Gostaria de verificar o status do meu pedido.' },
    { label: 'Falar com Atendente', message: 'Gostaria de falar com um atendente humano, por favor.' },
  ]

  // ---- Render ----
  return (
    <PageErrorBoundary>
      <div className="min-h-screen h-screen bg-background text-foreground flex overflow-hidden">
        {/* ---- Sidebar ---- */}
        <aside className={cn('flex flex-col bg-card border-r border-border/30 transition-all duration-300', sidebarCollapsed ? 'w-16' : 'w-64')}>
          {/* Brand */}
          <div className="p-4 border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-serif font-bold text-lg">B</span>
              </div>
              {!sidebarCollapsed && (
                <div className="overflow-hidden">
                  <h1 className="font-serif font-bold text-lg tracking-wide text-foreground leading-tight">BrazilCare</h1>
                  <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Atendimento</p>
                </div>
              )}
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2 space-y-1">
            {([
              { key: 'chat' as const, icon: HiOutlineChatBubbleLeftRight, label: 'Chat' },
              { key: 'tickets' as const, icon: HiOutlineTicket, label: 'Tickets' },
              { key: 'kb' as const, icon: HiOutlineBookOpen, label: 'Base de Conhecimento' },
            ]).map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  activeView === item.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
                {item.key === 'tickets' && displayTickets.length > 0 && !sidebarCollapsed && (
                  <span className="ml-auto text-xs bg-accent text-accent-foreground rounded-full px-2 py-0.5 font-semibold">{displayTickets.length}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Sample Data Toggle */}
          <div className="p-3 border-t border-border/20">
            <div className={cn('flex items-center gap-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
              {!sidebarCollapsed && <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>}
              <Switch id="sample-toggle" checked={showSample} onCheckedChange={setShowSample} />
            </div>
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-3 border-t border-border/20 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FiChevronDown className={cn('w-4 h-4 mx-auto transition-transform', sidebarCollapsed ? 'rotate-[-90deg]' : 'rotate-90')} />
          </button>

          {/* Agent Info */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-border/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Agentes do Sistema</p>
              <div className="space-y-1.5">
                {AGENTS_INFO.map((agent) => (
                  <div key={agent.id} className="flex items-start gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 transition-colors', activeAgentId === agent.id ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40')} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ---- Main Content ---- */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* ============ CHAT VIEW ============ */}
          {activeView === 'chat' && (
            <>
              {/* Chat Header */}
              <header className="flex items-center justify-between px-6 py-3 border-b border-border/20 bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <HiOutlineChatBubbleLeftRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-serif font-semibold text-foreground">Atendimento BrazilCare</h2>
                    <p className="text-xs text-muted-foreground">Suporte ao cliente em portugues</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-medium border-border/50">PT-BR</Badge>
                  {isLoading && <Badge variant="secondary" className="text-xs animate-pulse">Processando...</Badge>}
                </div>
              </header>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="max-w-3xl mx-auto space-y-4">
                  {displayMessages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      {msg.role === 'agent' && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                          <HiOutlineChatBubbleLeftRight className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className={cn('max-w-[75%]', msg.role === 'user' ? 'order-1' : '')}>
                        <div
                          className={cn(
                            'rounded-2xl px-4 py-3 shadow-sm',
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-card border border-border/30 rounded-bl-md border-l-2 border-l-primary/40'
                          )}
                        >
                          {msg.role === 'user' ? (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          ) : (
                            renderMarkdown(msg.text)
                          )}
                          {/* Attachments */}
                          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map((src, idx) =>
                                src ? (
                                  <img key={idx} src={src} alt="Anexo" className="w-20 h-20 object-cover rounded-lg border border-white/20" />
                                ) : null
                              )}
                            </div>
                          )}
                        </div>
                        {/* Metadata row */}
                        <div className="flex items-center gap-2 mt-1.5 px-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>
                          {msg.intent && <IntentBadge intent={msg.intent} />}
                          {msg.resolutionStatus && <StatusBadge status={msg.resolutionStatus} />}
                        </div>
                        {msg.agentUsed && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 px-1 italic">via {msg.agentUsed}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading && <TypingIndicator />}

                  {errorMsg && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                      <FiAlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <span className="text-destructive">{errorMsg}</span>
                      <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setErrorMsg(null)}>
                        Fechar
                      </Button>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Quick Actions */}
              {displayMessages.length <= 1 && !isLoading && (
                <div className="px-6 py-2">
                  <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                    {quickActions.map((action) => (
                      <Button
                        key={action.label}
                        variant="secondary"
                        size="sm"
                        className="text-xs rounded-full hover:bg-primary hover:text-primary-foreground transition-all duration-200 shadow-sm"
                        onClick={() => handleQuickAction(action.message)}
                        disabled={isLoading}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* File Preview */}
              {selectedFiles.length > 0 && (
                <div className="px-6 py-2 border-t border-border/10">
                  <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="relative group">
                        {filePreviews[idx] ? (
                          <img src={filePreviews[idx]} alt={file.name} className="w-16 h-16 object-cover rounded-lg border border-border/30 shadow-sm" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg border border-border/30 bg-muted flex items-center justify-center shadow-sm">
                            <FiFile className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(idx)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FiX className="w-3 h-3" />
                        </button>
                        <p className="text-[9px] text-muted-foreground mt-0.5 truncate max-w-[64px]">{file.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Bar */}
              <div className="px-6 py-4 border-t border-border/20 bg-card/30">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary flex-shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                  >
                    <FiPaperclip className="w-5 h-5" />
                  </Button>
                  <div className="flex-1 relative">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      className="pr-4 rounded-xl bg-background border-border/50 focus:border-primary/60 transition-colors"
                      disabled={isLoading}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0 px-4 shadow-sm"
                    disabled={isLoading && !inputValue.trim() && selectedFiles.length === 0}
                  >
                    {isLoading ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <FiSend className="w-4 h-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}

          {/* ============ TICKETS VIEW ============ */}
          {activeView === 'tickets' && (
            <div className="flex-1 flex flex-col">
              <header className="flex items-center justify-between px-6 py-3 border-b border-border/20 bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <HiOutlineTicket className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-serif font-semibold text-foreground">Historico de Tickets</h2>
                    <p className="text-xs text-muted-foreground">{displayTickets.length} ticket(s) registrado(s)</p>
                  </div>
                </div>
              </header>

              {/* Filter */}
              <div className="px-6 py-3 border-b border-border/10 flex items-center gap-2 flex-wrap">
                <FiFilter className="w-4 h-4 text-muted-foreground" />
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'all' as const, label: 'Todos' },
                    { key: 'open' as const, label: 'Abertos' },
                    { key: 'in_progress' as const, label: 'Em Andamento' },
                    { key: 'resolved' as const, label: 'Resolvidos' },
                  ]).map((f) => (
                    <Button
                      key={f.key}
                      variant={ticketFilter === f.key ? 'default' : 'ghost'}
                      size="sm"
                      className="text-xs rounded-full"
                      onClick={() => setTicketFilter(f.key)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>

              <ScrollArea className="flex-1 px-6 py-4">
                {filteredTickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <HiOutlineTicket className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-serif font-semibold text-lg mb-1">Nenhum ticket encontrado</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Tickets sao criados automaticamente quando uma solicitacao e escalada para atendimento humano.
                    </p>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-3">
                    {filteredTickets.map((ticket) => (
                      <Card
                        key={ticket.id}
                        className="cursor-pointer hover:shadow-md transition-shadow duration-200 border-border/30"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="text-xs font-mono text-muted-foreground">{ticket.ticketId}</span>
                                <PriorityBadge priority={ticket.priority} />
                                <TicketStatusBadge status={ticket.status} />
                              </div>
                              <p className="text-sm font-medium text-foreground line-clamp-2">{ticket.summary}</p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span>{formatDate(ticket.createdAt)}</span>
                                {ticket.estimatedResponseTime && (
                                  <span className="flex items-center gap-1">
                                    <FiClock className="w-3 h-3" />
                                    Resposta em {ticket.estimatedResponseTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Ticket Detail Dialog */}
              <Dialog open={selectedTicket !== null} onOpenChange={(open) => { if (!open) setSelectedTicket(null) }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-serif flex items-center gap-2">
                      {selectedTicket?.ticketId || 'Ticket'}
                      {selectedTicket?.priority && <PriorityBadge priority={selectedTicket.priority} />}
                    </DialogTitle>
                    <DialogDescription className="text-sm">{selectedTicket?.summary || ''}</DialogDescription>
                  </DialogHeader>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Status</span>
                      {selectedTicket?.status && <TicketStatusBadge status={selectedTicket.status} />}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Criado em</span>
                      <span className="text-xs">{selectedTicket?.createdAt ? formatDate(selectedTicket.createdAt) : ''}</span>
                    </div>
                    {selectedTicket?.estimatedResponseTime && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Tempo de resposta</span>
                        <span className="text-xs">{selectedTicket.estimatedResponseTime}</span>
                      </div>
                    )}
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Conversa relacionada</p>
                      {Array.isArray(selectedTicket?.messages) && selectedTicket.messages.length > 0 ? (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {selectedTicket.messages.map((msg) => (
                            <div key={msg.id} className={cn('text-xs p-2 rounded-lg', msg.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground')}>
                              <span className="font-semibold">{msg.role === 'user' ? 'Cliente' : 'Agente'}:</span>{' '}
                              {msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Nenhuma mensagem registrada</p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ============ KNOWLEDGE BASE VIEW ============ */}
          {activeView === 'kb' && (
            <div className="flex-1 flex flex-col">
              <header className="flex items-center justify-between px-6 py-3 border-b border-border/20 bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <HiOutlineBookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-serif font-semibold text-foreground">Base de Conhecimento</h2>
                    <p className="text-xs text-muted-foreground">Gerencie documentos de politicas e procedimentos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={kbFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={handleKbUpload}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="rounded-lg shadow-sm"
                    onClick={() => kbFileInputRef.current?.click()}
                    disabled={kbLoading || kbUploading}
                  >
                    {kbUploading ? (
                      <FiRefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FiUpload className="w-4 h-4 mr-2" />
                    )}
                    Enviar Documento
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchDocuments(RAG_ID)}
                    disabled={kbLoading}
                  >
                    <FiRefreshCw className={cn('w-4 h-4', kbLoading && 'animate-spin')} />
                  </Button>
                </div>
              </header>

              <ScrollArea className="flex-1 px-6 py-4">
                <div className="max-w-3xl mx-auto">
                  {kbError && (
                    <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                      <FiAlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <span className="text-destructive">{kbError}</span>
                    </div>
                  )}

                  {kbLoading && !documents ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-16 bg-muted rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : Array.isArray(documents) && documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map((doc, idx) => (
                        <Card key={doc.id || idx} className="border-border/30">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <FiFile className="w-5 h-5 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">{doc.fileType}</Badge>
                                  {doc.status && (
                                    <span className={cn('flex items-center gap-1', doc.status === 'active' ? 'text-emerald-600' : doc.status === 'processing' ? 'text-amber-600' : 'text-muted-foreground')}>
                                      {doc.status === 'active' && <FiCheck className="w-3 h-3" />}
                                      {doc.status === 'processing' && <FiRefreshCw className="w-3 h-3 animate-spin" />}
                                      {doc.status}
                                    </span>
                                  )}
                                  {doc.uploadedAt && <span>{formatDate(doc.uploadedAt)}</span>}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                              onClick={() => handleKbDelete(doc.fileName)}
                              disabled={kbLoading}
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <HiOutlineBookOpen className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-serif font-semibold text-lg mb-1">Nenhum documento encontrado</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-4">
                        Envie documentos PDF, DOCX ou TXT para alimentar a base de conhecimento do atendimento.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => kbFileInputRef.current?.click()}
                        disabled={kbUploading}
                      >
                        <FiUpload className="w-4 h-4 mr-2" />
                        Enviar Primeiro Documento
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </main>
      </div>
    </PageErrorBoundary>
  )
}
