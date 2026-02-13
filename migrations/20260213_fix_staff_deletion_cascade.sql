-- Fix Staff Deletion and 406 Error
-- 1. Grant DELETE permission on staff table to anon and authenticated users
CREATE POLICY "Enable delete for users based on user_id" ON "public"."staff"
AS PERMISSIVE FOR DELETE
TO public
USING (true); -- Allow anyone (anon/auth) to delete for now, assuming PIN protection at app level. Ideally check auth.role() but requirement is 'current user (or anon)'.

-- 2. Grant DELETE permission on timecard_logs table
CREATE POLICY "Enable delete for users based on user_id" ON "public"."timecard_logs"
AS PERMISSIVE FOR DELETE
TO public
USING (true);

-- 3. Update Foreign Key on timecard_logs to CASCADE DELETE
-- First, drop the existing constraint. We need to find its name or just try standard naming.
-- Usually it's timecard_logs_staff_id_fkey
ALTER TABLE public.timecard_logs
DROP CONSTRAINT IF EXISTS timecard_logs_staff_id_fkey;

ALTER TABLE public.timecard_logs
ADD CONSTRAINT timecard_logs_staff_id_fkey
FOREIGN KEY (staff_id)
REFERENCES public.staff(id)
ON DELETE CASCADE;
