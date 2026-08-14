// Proves the Realtime doorbell end to end, using the SAME publishable key a
// browser gets. Run it, then bump a room_pulse row from anywhere (SQL, or by
// playing a card) and confirm an event lands here.
//
//   node scripts/test-doorbell.js [roomId]
//
// Two things it is checking, and both matter:
//   1. The event arrives at all — i.e. the table really is in the realtime
//      publication and the anon policy really does permit the read.
//   2. The payload contains ONLY non-secret columns. If a hand ever shows up in
//      this output, something has subscribed to the wrong table and every player
//      can read every other player's cards.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://qbkcnjlshkckpkoiavje.supabase.co';
const KEY = 'sb_publishable_L-oP50-6nKB6XDH8wU-32Q_lpiBY_A8';
const roomId = process.argv[2] || null;

const client = createClient(URL, KEY, {
  db: { schema: 'salty_schooner' },
  auth: { persistSession: false, autoRefreshToken: false }
});

const filter = roomId ? { filter: `room_id=eq.${roomId}` } : {};
let events = 0;

client
  .channel('pulse-test')
  .on(
    'postgres_changes',
    { event: '*', schema: 'salty_schooner', table: 'room_pulse', ...filter },
    payload => {
      events++;
      console.log(`EVENT #${events} ${payload.eventType} keys=[${Object.keys(payload.new || {}).join(',')}]`);
      console.log('  payload:', JSON.stringify(payload.new));
    }
  )
  .subscribe(status => {
    console.log('STATUS', status);
    if (status === 'SUBSCRIBED') console.log('READY — listening for pulse bumps');
  });

// Also prove the negative: this key must NOT be able to read the tables that
// hold hands and tokens. A successful read here is a security failure.
(async () => {
  for (const table of ['rooms', 'players']) {
    const { data, error } = await client.from(table).select('*').limit(1);
    console.log(`LEAK CHECK ${table}: ${error ? 'DENIED (' + error.message + ')' : 'READABLE — ' + JSON.stringify(data)}`);
  }
})();

setTimeout(() => {
  console.log(`DONE — ${events} event(s) received`);
  process.exit(events > 0 ? 0 : 1);
}, 25000);
