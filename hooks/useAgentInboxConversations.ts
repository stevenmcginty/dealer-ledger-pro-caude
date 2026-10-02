import { useEffect, useState } from 'react';
import { useData } from './useData';
import {
    Conversation,
    subscribeToAgentConversations,
    subscribeToAgentConversationsAcross,
    subscribeToSharedInbox,
} from '../services/salesAgentService';

/**
 * This ledger's Agent Inbox conversations plus any that landed on a
 * shared-inbox sibling ledger, de-duplicated by `companyId:id`.
 *
 * The header has two buttons (WhatsApp and the inbox), each in two headers
 * (mobile and desktop). They all share one set of listeners per ledger: the
 * first caller opens them, the last one to unmount closes them.
 */

type Listener = (list: Conversation[]) => void;

interface Feed {
    own: Conversation[];
    shared: Conversation[];
    merged: Conversation[];
    listeners: Set<Listener>;
    stop: () => void;
}

const feeds = new Map<string, Feed>();

const mergeFeed = (feed: Feed): Conversation[] => {
    if (!feed.shared.length) return feed.own;
    const seen = new Set<string>();
    const list: Conversation[] = [];
    [...feed.shared, ...feed.own].forEach(conv => {
        const key = `${conv.companyId || ''}:${conv.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(conv);
    });
    return list;
};

const openFeed = (companyId: string): Feed => {
    const feed: Feed = { own: [], shared: [], merged: [], listeners: new Set(), stop: () => {} };
    const publish = () => {
        feed.merged = mergeFeed(feed);
        feed.listeners.forEach(listener => listener(feed.merged));
    };

    let stopAcross: (() => void) | null = null;
    const stopOwn = subscribeToAgentConversations(companyId, list => {
        feed.own = list;
        publish();
    });
    const stopInbox = subscribeToSharedInbox(companyId, inbox => {
        stopAcross?.();
        stopAcross = null;
        if (!inbox?.memberCompanyIds?.length) {
            if (feed.shared.length) {
                feed.shared = [];
                publish();
            }
            return;
        }
        stopAcross = subscribeToAgentConversationsAcross(inbox.memberCompanyIds, list => {
            feed.shared = list;
            publish();
        });
    });

    feed.stop = () => {
        stopOwn();
        stopInbox();
        stopAcross?.();
    };
    return feed;
};

export function useAgentInboxConversations(): Conversation[] {
    const { companyId } = useData();
    const [list, setList] = useState<Conversation[]>(() => (companyId && feeds.get(companyId)?.merged) || []);

    useEffect(() => {
        if (!companyId) {
            setList([]);
            return;
        }
        let feed = feeds.get(companyId);
        if (!feed) {
            feed = openFeed(companyId);
            feeds.set(companyId, feed);
        }
        const current = feed;
        current.listeners.add(setList);
        setList(current.merged);
        return () => {
            current.listeners.delete(setList);
            if (current.listeners.size) return;
            current.stop();
            if (feeds.get(companyId) === current) feeds.delete(companyId);
        };
    }, [companyId]);

    return list;
}
