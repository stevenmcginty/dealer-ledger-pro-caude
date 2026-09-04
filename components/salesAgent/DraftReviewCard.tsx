import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useToast } from '../ui';
import Spinner from '../common/Spinner';
import { WhatsAppIcon } from '../icons';
import {
    CHANNEL_LABELS,
    Conversation,
    answerAgentQuestion,
    approveAgentDraft,
    approvedSendMessage,
    conversationEmail,
    conversationName,
    conversationPhone,
    discardAgentDraft,
    formatAgentTime,
    instructAgent,
    subscribeToSalesAgentSettings,
} from '../../services/salesAgentService';
import { phoneFromThread } from '../../utils/agentInboxBounce';
import SendViaBar, { sendViaLabel, type SendViaChoice } from './SendViaBar';

interface DraftReviewCardProps {
    conv: Conversation;
    companyId: string;
    agentName: string;
}

/**
 * Approve, edit, or send Dave back to rewrite — without leaving the page.
 *
 * The customer's words and Dave's draft both sit here so the notification bell
 * is enough. Editing the box and pressing Approve is what the customer gets;
 * telling Dave how it should sound produces a fresh draft and another ping.
 */
const DraftReviewCard: React.FC<DraftReviewCardProps> = ({ conv, companyId, agentName }) => {
    const toast = useToast();
    const draft = conv.pendingDraft;
    const [text, setText] = useState(draft?.text || '');
    const [instruction, setInstruction] = useState('');
    const [busy, setBusy] = useState<'' | 'approve' | 'rewrite' | 'discard'>('');
    // Dave writes it; the toggle decides whose name goes at the bottom.
    const [ownerName, setOwnerName] = useState('');
    const [signAs, setSignAs] = useState<'agent' | 'owner'>('agent');
    const phone = conversationPhone(conv) || phoneFromThread(conv);
    const emailOk = !!conversationEmail(conv) && !conv.emailBounce;
    const [sendVia, setSendVia] = useState<SendViaChoice>(
        phone && emailOk && !conv.lastOutboundAt ? 'both' : conv.channel === 'whatsapp' ? 'whatsapp' : 'email'
    );
    useEffect(() => subscribeToSalesAgentSettings(companyId, s => setOwnerName(s.ownerName || '')), [companyId]);

    const draftId = draft?.id || '';
    useEffect(() => {
        setText(draft?.text || '');
        setInstruction('');
        setBusy('');
    }, [draftId]);

    const handleApprove = useCallback(async () => {
        const next = text.trim();
        if (!next || busy) return;
        setBusy('approve');
        try {
            const result = await approveAgentDraft(companyId, conv.id, next, signAs, sendVia, phone);
            const sent = (result.sent || [sendVia === 'both' ? 'email' : sendVia]).map(ch => CHANNEL_LABELS[ch] || ch).join(' and ');
            toast.success(approvedSendMessage(sent, result.sendAfter));
        } catch (err: any) {
            toast.error(err?.message || 'That draft was not sent.');
            setBusy('');
        }
    }, [text, busy, companyId, conv.id, toast, signAs, sendVia, phone]);

    const handleRewrite = useCallback(async () => {
        const next = instruction.trim();
        if (!next || busy) return;
        setBusy('rewrite');
        try {
            await instructAgent(companyId, conv.id, next);
            toast.success(`${agentName} is rewriting that — the new draft will land here.`);
        } catch (err: any) {
            toast.error(err?.message || `Could not pass that on to ${agentName}.`);
            setBusy('');
        }
    }, [instruction, busy, companyId, conv.id, agentName, toast]);

    const handleDiscard = useCallback(async () => {
        if (busy) return;
        setBusy('discard');
        try {
            await discardAgentDraft(companyId, conv.id);
            toast.success('Draft binned. Nothing was sent.');
        } catch (err: any) {
            toast.error(err?.message || 'That draft could not be discarded.');
            setBusy('');
        }
    }, [busy, companyId, conv.id, toast]);

    if (!draft) return null;

    const rewriting = busy === 'rewrite';

    const isWa = conv.channel === 'whatsapp' || sendVia === 'whatsapp';

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-semibold text-white">{conversationName(conv)}</p>
                <span className="font-mono text-[11px] text-gray-500">#{conv.shortId}</span>
                {isWa ? (
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/40">
                        <WhatsAppIcon className="h-3 w-3" /> WhatsApp
                    </span>
                ) : (
                    <Badge size="sm" variant="warning">{CHANNEL_LABELS[conv.channel] || conv.channel}</Badge>
                )}
                {conv.vehicleInterest?.title && (
                    <span className="truncate text-[11px] text-gray-400">{conv.vehicleInterest.title}</span>
                )}
            </div>

            {draft.customerText && (
                <div className={`rounded-xl px-3.5 py-2.5 text-sm shadow-sm ${
                    isWa
                        ? 'bg-[#202c33] border border-gray-700/60 border-l-4 border-l-[#25d366] text-gray-100'
                        : 'bg-gray-900/70 border border-gray-700/60 text-gray-200'
                }`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isWa ? 'text-[#25d366]' : 'text-gray-500'}`}>
                        {isWa ? 'Customer wrote on WhatsApp' : 'They said'}
                    </p>
                    <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">
                        {draft.customerText}
                    </p>
                </div>
            )}

            <div>
                <p className={`text-[11px] font-medium uppercase tracking-wide ${isWa ? 'text-[#25d366]' : 'text-gray-500'}`}>
                    {agentName} drafted · {formatAgentTime(draft.createdAt)}
                    {draft.subject ? ` · ${draft.subject}` : ''}
                </p>
                <textarea
                    rows={7}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    disabled={!!busy}
                    aria-label={`The reply ${agentName} has drafted`}
                    className={`mt-1 w-full resize-y rounded-lg border ${
                        isWa
                            ? 'border-[#25d366]/50 focus:border-[#25d366] focus:ring-2 focus:ring-[#25d366]/40'
                            : 'border-amber-500/40 focus:ring-2 focus:ring-amber-500/40'
                    } bg-gray-900/70 px-3 py-2 text-sm leading-relaxed text-white placeholder-gray-500 focus:outline-none disabled:opacity-60`}
                />
            </div>

            {ownerName && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>Send as</span>
                    <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
                        {(['agent', 'owner'] as const).map(who => (
                            <button
                                key={who}
                                type="button"
                                onClick={() => setSignAs(who)}
                                disabled={!!busy}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${
                                    signAs === who ? (isWa ? 'bg-[#25d366] text-white' : 'bg-brand-600 text-white') : 'bg-gray-900/60 text-gray-300 hover:bg-gray-800'
                                }`}
                            >
                                {who === 'agent' ? agentName : ownerName}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {(phone || emailOk) && (
                <SendViaBar
                    value={sendVia}
                    onChange={setSendVia}
                    emailOk={emailOk}
                    phone={phone}
                    needsOpener={!!phone && !conv.lastCustomerMessageAt}
                    disabled={!!busy}
                />
            )}

            <div className="flex flex-wrap gap-2 items-center">
                {isWa ? (
                    <button
                        type="button"
                        onClick={handleApprove}
                        disabled={!text.trim() || !!busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-[#25d366]/25 disabled:opacity-50 transition-all active:scale-95"
                    >
                        <WhatsAppIcon className="h-4 w-4" />
                        {busy === 'approve' ? 'Sending…' : `${sendViaLabel(sendVia)}${signAs === 'owner' && ownerName ? ` as ${ownerName}` : ''}`}
                    </button>
                ) : (
                    <Button
                        size="sm"
                        variant="primary"
                        onClick={handleApprove}
                        loading={busy === 'approve'}
                        disabled={!text.trim() || !!busy}
                    >
                        {sendViaLabel(sendVia)}{signAs === 'owner' && ownerName ? ` as ${ownerName}` : ''}
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDiscard}
                    loading={busy === 'discard'}
                    disabled={!!busy}
                >
                    Discard
                </Button>
            </div>
            <p className="text-xs text-gray-500">
                Sends during office hours. Approve after hours and it waits until opening time.
            </p>

            <div className="border-t border-gray-700/60 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Tell {agentName} to rewrite
                </p>
                <textarea
                    rows={2}
                    value={instruction}
                    onChange={e => setInstruction(e.target.value)}
                    disabled={!!busy}
                    placeholder={`e.g. sound a bit warmer, mention the service history`}
                    aria-label={`Instructions for ${agentName}`}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleRewrite();
                        }
                    }}
                    className="mt-1 w-full resize-y rounded-lg border border-gray-600 bg-gray-900/70 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
                />
                <div className="mt-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleRewrite}
                        loading={rewriting}
                        disabled={!instruction.trim() || !!busy}
                    >
                        {rewriting ? `${agentName} is rewriting…` : `Rewrite`}
                    </Button>
                </div>
                {rewriting && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-brand-300">
                        <Spinner className="h-3.5 w-3.5" />
                        New draft will replace this one when it is ready.
                    </p>
                )}
            </div>
        </div>
    );
};

interface QuestionReviewCardProps {
    conv: Conversation;
    companyId: string;
    agentName: string;
}

/** Dave has stopped and wants an answer before he writes the next reply. */
export const QuestionReviewCard: React.FC<QuestionReviewCardProps> = ({ conv, companyId, agentName }) => {
    const toast = useToast();
    const question = conv.pendingQuestion;
    const [answer, setAnswer] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAnswer = useCallback(async () => {
        const next = answer.trim();
        if (!next || busy) return;
        setBusy(true);
        try {
            await answerAgentQuestion(companyId, conv.id, next);
            setAnswer('');
            toast.success(`Passed back to ${agentName}.`);
        } catch (err: any) {
            toast.error(err?.message || 'Could not pass that answer back.');
        } finally {
            setBusy(false);
        }
    }, [answer, busy, companyId, conv.id, agentName, toast]);

    if (!question) return null;

    const isWa = conv.channel === 'whatsapp';

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-semibold text-white">{conversationName(conv)}</p>
                <span className="font-mono text-[11px] text-gray-500">#{conv.shortId}</span>
                {isWa ? (
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/40">
                        <WhatsAppIcon className="h-3 w-3" /> WhatsApp
                    </span>
                ) : null}
                <Badge size="sm" variant="warning">Waiting on you</Badge>
            </div>
            <p className="text-sm text-gray-100">{question.question}</p>
            {question.context && <p className="text-xs text-gray-400">{question.context}</p>}
            <textarea
                rows={2}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                disabled={busy}
                placeholder="Answer in your own words — Dave will phrase it"
                aria-label={`Your answer for ${agentName}`}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAnswer();
                    }
                }}
                className={`w-full resize-y rounded-lg border ${
                    isWa
                        ? 'border-[#25d366]/50 focus:border-[#25d366] focus:ring-2 focus:ring-[#25d366]/40'
                        : 'border-amber-500/40 focus:ring-2 focus:ring-amber-500/40'
                } bg-gray-900/70 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none`}
            />
            {isWa ? (
                <button
                    type="button"
                    onClick={handleAnswer}
                    disabled={!answer.trim() || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-[#25d366]/25 disabled:opacity-50 transition-all active:scale-95"
                >
                    <WhatsAppIcon className="h-4 w-4" />
                    {busy ? 'Sending…' : 'Send answer'}
                </button>
            ) : (
                <Button size="sm" variant="primary" onClick={handleAnswer} loading={busy} disabled={!answer.trim() || busy}>
                    Send answer
                </Button>
            )}
        </div>
    );
};

export default DraftReviewCard;
