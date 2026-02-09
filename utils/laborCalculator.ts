import { differenceInSeconds } from 'date-fns';

/**
 * 実労働時間を「分」単位で計算します。
 * 秒単位で計算した後、60秒未満は切り捨てます。
 * 
 * @param start 勤務開始時刻
 * @param end 勤務終了時刻（nullの場合は現在時刻または計算対象外）
 * @returns 実労働時間（分）
 */
export const calculateNetWorkingMinutes = (start: Date | string, end: Date | string | null): number => {
    if (!start || !end) return 0;

    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;

    // 秒単位での差分を取得
    const diffSeconds = differenceInSeconds(endDate, startDate);

    // 負の値は0とする
    if (diffSeconds < 0) return 0;

    // 60秒未満を切り捨てて分に変換
    return Math.floor(diffSeconds / 60);
};

/**
 * 分単位の労働時間から給与を計算します。
 * 1分単位で時給の1/60を計算し、小数点以下は切り捨てます。
 * 
 * @param minutes 実労働時間（分）
 * @param hourlyWage 時給
 * @returns 給与額（円）
 */
export const calculateSalary = (minutes: number, hourlyWage: number): number => {
    if (minutes <= 0 || hourlyWage <= 0) return 0;

    // (労働時間(分) / 60) * 時給
    return Math.floor(minutes * (hourlyWage / 60));
};

/**
 * 分を「時間」表示（例: 1.5h）に変換します。
 * 
 * @param minutes 分
 * @returns 時間（小数点第2位まで）
 */
export const formatHoursFromMinutes = (minutes: number): number => {
    return Math.floor((minutes / 60) * 100) / 100;
};
