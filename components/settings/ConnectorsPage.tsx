import React from 'react';
import WebsiteConnectorCard from './WebsiteConnectorCard';

/**
 * The other systems this ledger talks to on its own.
 *
 * Kept apart from Integrations, which is about accounts you sign in to — Google,
 * Twilio, WhatsApp. A connector is a standing agreement instead: something that
 * keeps running in the background because stock changed, with nobody watching.
 */
const ConnectorsPage = () => (
    <div className="space-y-6">
        <WebsiteConnectorCard />
    </div>
);

export default ConnectorsPage;
