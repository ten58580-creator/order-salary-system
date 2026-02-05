
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnv() {
    try {
        const envPath = path.join(process.cwd(), '.env.local');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach((line) => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                env[key] = val;
            }
        });
        return env;
    } catch (e) {
        return process.env;
    }
}

const env = getEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Setting up Test Client...');

    // 1. Create Company A
    let companyId;
    const { data: companies } = await supabase.from('companies').select('*').eq('name', '株式会社A社').single();
    if (companies) {
        companyId = companies.id;
        console.log('Company A exists:', companyId);
    } else {
        const { data, error } = await supabase.from('companies').insert([{ name: '株式会社A社', address: 'Tokyo' }]).select().single();
        if (error) {
            console.error('Error creating company:', error);
            return;
        }
        companyId = data.id;
        console.log('Created Company A:', companyId);
    }

    // 2. Create Products
    const products = [
        { name: 'プレミアムプリン', unit_price: 300 },
        { name: '濃厚チーズケーキ', unit_price: 1500 }
    ];

    for (const p of products) {
        const { data } = await supabase.from('products').select('*').eq('company_id', companyId).eq('name', p.name).single();
        if (!data) {
            await supabase.from('products').insert([{ ...p, company_id: companyId }]);
            console.log(`Created Product: ${p.name}`);
        }
    }

    // 3. Create User
    const email = 'client_a@example.com';
    const password = 'password1234';
    let userId;

    console.log(`Creating user: ${email}`);

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
    });

    if (authError) {
        console.log('SignUp result:', authError.message);
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInData.user) {
            userId = signInData.user.id;
            console.log('Logged in existing user.');
        } else {
            // Try just regular login, maybe it was just a warning
        }
    } else if (authData.user) {
        userId = authData.user.id;
        console.log('Created new user.');
    }

    // Double check user ID
    if (!userId) {
        const { data } = await supabase.auth.getUser();
        // This won't work in script without session context usually, but after signInWithPassword it persists in client instance memory for this run
        const { data: sessionData } = await supabase.auth.getSession();
        userId = sessionData.session?.user?.id;
    }


    if (userId) {
        // 4. Update Staff Role
        // Check if exists
        const { data: staff } = await supabase.from('staff').select('id').eq('id', userId).single();

        if (staff) {
            const { error } = await supabase.from('staff').update({ role: 'client', company_id: companyId, pin: '9999' }).eq('id', userId);
            if (error) console.error(error);
            else console.log('Updated existing staff role with PIN.');
        } else {
            const { error } = await supabase.from('staff').insert({
                id: userId,
                name: 'A社担当者',
                role: 'client',
                company_id: companyId,
                dependents: 0,
                pin: '9999'
            });
            if (error) console.error('Insert Error:', error);
            else console.log('Inserted new staff record.');
        }

        console.log('\n=============================================');
        console.log(' [TEST ACCOUNT CREDENTIALS] ');
        console.log(` Login URL: http://localhost:3000/login`);
        console.log(` Email    : ${email}`);
        console.log(` Password : ${password}`);
        console.log('=============================================\n');
    } else {
        console.error('Failed to authenticate or create user. Sign up manually if needed.');
    }
}

main();
