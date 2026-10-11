import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useToast } from '../ui';
import Spinner from '../common/Spinner';
import { WhatsAppMark } from './inbox/parts';
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
                <p className="text-sm font-semibold text-ink">{conversationName(conv)}</p>
                <span className="font-mono text-xs text-ink-3">#{conv.shortId}</span>
                {isWa ? (
                    <Badge size="sm"><WhatsAppMark brand className="h-3.5 w-3.5" /> WhatsApp</Badge>
                ) : (
                    <Badge size="sm" variant="warning">{CHANNEL_LABELS[conv.channel] || conv.channel}</Badge>
                )}
                {conv.vehicleInterest?.title && (
                    <span className="truncate text-xs text-ink-3">{conv.vehicleInterest.title}</span>
                )}
            </div>

            {draft.customerText && (
                <div className={`rounded-card px-3.5 py-2.5 text-sm text-ink ${
                    isWa ? 'rounded-es-[4px] bg-bubble-in' : 'border border-line bg-surface'
                }`}>
                    <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                        {isWa ? 'Customer wrote on WhatsApp' : 'They said'}
                    </p>
                    <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">
                        {draft.customerText}
                    </p>
                </div>
            )}

            <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-accent-text">
                    {agentName} drafted · {formatAgentTime(draft.createdAt)}
                    {draft.subject ? ` · ${draft.subject}` : ''}
                </p>
                <textarea
                    rows={7}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    disabled={!!busy}
                    aria-label={`The reply ${agentName} has drafted`}
                    className="mt-1.5 w-full resize-y rounded-control border border-accent bg-surface px-3.5 py-3 text-base leading-[1.45] text-ink placeholder:text-ink-3 disabled:bg-surface-2 disabled:text-ink-3"
                />
            </div>

            {ownerName && (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                    <span>Send as</span>
                    <div className="inline-flex gap-[3px] rounded-control border border-line bg-surface-2 p-[3px]">
                        {(['agent', 'owner'] as const).map(who => (
                            <button
                                key={who}
                                type="button"
                                onClick={() => setSignAs(who)}
                                disabled={!!busy}
                                className={`min-h-[40px] rounded-[6px] px-3 text-sm font-semibold transition-colors duration-quick ease-out ${
                                    signAs === who ? 'bg-surface text-ink shadow-e1 ring-1 ring-line' : 'text-ink-2 hover:text-ink'
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
                    <Button
                        type="button"
                        onClick={handleApprove}
                        disabled={!text.trim() || !!busy}
                        icon={<WhatsAppMark />}
                    >
                        {busy === 'approve' ? 'Sending…' : `${sendViaLabel(sendVia)}${signAs === 'owner' && ownerName ? ` as ${ownerName}` : ''}`}
                    </Button>
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
            <p className="text-sm text-ink-3">
                Sends during office hours. Approve after hours and it waits until opening time.
            </p>

            <div className="border-t border-line pt-3">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
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
                    className="mt-1.5 w-full resize-y rounded-control border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-3 disabled:bg-surface-2 disabled:text-ink-3"
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
                    <p className="mt-2 flex items-center gap-2 text-sm text-accent-text">
                        <Spinner className="h-4 w-4" />
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
                <p className="text-sm font-semibold text-ink">{conversationName(conv)}</p>
                <span className="font-mono text-xs text-ink-3">#{conv.shortId}</span>
                {isWa ? (
                    <Badge size="sm"><WhatsAppMark brand className="h-3.5 w-3.5" /> WhatsApp</Badge>
                ) : null}
                <Badge size="sm" variant="warning">Waiting on you</Badge>
            </div>
            <p className="text-sm text-ink">{question.question}</p>
            {question.context && <p className="text-sm text-ink-3">{question.context}</p>}
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
                className="w-full resize-y rounded-control border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-3"
            />
            {isWa ? (
                <Button
                    type="button"
                    onClick={handleAnswer}
                    disabled={!answer.trim() || busy}
                    icon={<WhatsAppMark />}
                >
                    {busy ? 'Sending…' : 'Send answer'}
                </Button>
            ) : (
                <Button size="sm" variant="primary" onClick={handleAnswer} loading={busy} disabled={!answer.trim() || busy}>
                    Send answer
                </Button>
            )}
        </div>
    );
};

export default DraftReviewCard;
