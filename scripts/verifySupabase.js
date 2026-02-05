const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Error: Missing Supabase environment variables in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyConnection() {
    console.log('Verifying Supabase connection...');
    console.log('URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('Key:', supabaseAnonKey ? 'Set' : 'Missing');

    try {
        // Check staff table
        console.log('\n--- Checking staff table ---');
        const { data: staffData, error: staffError } = await supabase
            .from('staff')
            .select('*')
            .limit(1);

        if (staffError) {
            console.error('Error fetching staff:', staffError.message);
        } else {
            console.log('Success! Staff table reachable.');
            console.log('Sample data:', staffData);
        }

        // Check timecards table
        console.log('\n--- Checking timecards table ---');
        const { data: timecardsData, error: timecardsError } = await supabase
            .from('timecards')
            .select('*')
            .limit(1);

        if (timecardsError) {
            console.error('Error fetching timecards:', timecardsError.message);
        } else {
            console.log('Success! Timecards table reachable.');
            console.log('Sample data:', timecardsData);
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

verifyConnection();
