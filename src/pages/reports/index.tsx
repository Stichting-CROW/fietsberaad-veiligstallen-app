import React, { useState, useEffect } from "react";
import { type NextPage } from "next/types";
import moment from "moment";

import ReportTable from "~/utils/reports/report-table";
import { noReport, type ReportContent } from "~/utils/reports/types";

const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

const extractText = (element: React.ReactNode): string => {
    if (typeof element === 'string') {
        return element;
    }
    if (typeof element === 'number') {
        return element.toString();
    }
    if (React.isValidElement(element)) {
        const children = element.props.children;
        if (Array.isArray(children)) {
            return children.map(extractText).join('');
        }
        return extractText(children);
    }
    return '';
};

const convertToCSV = (objArray: any[], columns: string[], hiddenColumns: string[]): string => {
    const visibleColumns = columns.filter(col => !hiddenColumns.includes(col));
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = visibleColumns.join(',') + '\r\n';

    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (const index in visibleColumns) {
            if (line !== '') line += ',';
            line += extractText(array[i][visibleColumns[index] as string]);
        }
        str += line + '\r\n';
    }

    return str;
};

const Report: NextPage = () => {
    let filterSettings = {
        selectedReport: 'openclose',
        filterType: '',
        isNs: 'all',
        filterDateTime: moment().format('YYYY-MM-DDTHH:mm'),
        showData: true
    };

    if (typeof window !== 'undefined') {
        const jsonfilterSettings = localStorage.getItem('filterSetings');
        if (null !== jsonfilterSettings) {
            filterSettings = Object.assign(filterSettings, JSON.parse(jsonfilterSettings));
        }
    }

    const [selectedReport, setSelectedReport] = useState<string>(filterSettings.selectedReport);
    const [filterType, setFilterType] = useState<string>(filterSettings.filterType);
    const [filterDateTime, setFilterDateTime] = useState<string>(filterSettings.filterDateTime);
    const [isNs, setIsNs] = useState<string>(filterSettings.isNs);
    const [showData, setShowData] = useState<boolean>(filterSettings.showData);

    const [reportContent, setReportContent] = useState<ReportContent | undefined>(noReport);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const updateReport = async () => {
            const filterSettings = {
                selectedReport,
                filterType,
                isNs,
                filterDateTime,
                showData
            }
            localStorage.setItem('filterSetings', JSON.stringify(filterSettings));
            
            switch (selectedReport) {
                case 'openclose':
                    // Use the new protected API route
                    setLoading(true);
                    try {
                        const response = await fetch('/api/protected/dev-reports/openingtimes', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                filterType,
                                isNs,
                                filterDateTime,
                                showData
                            }),
                        });

                        if (!response.ok) {
                            throw new Error(`Error: ${response.statusText}`);
                        }

                        const reportContent = await response.json();
                        setReportContent(reportContent);
                    } catch (error) {
                        console.error('Error fetching opening times report:', error);
                        setReportContent(noReport);
                    } finally {
                        setLoading(false);
                    }
                    break;
                case 'baddata':
                    // Use the new protected API route
                    setLoading(true);
                    try {
                        const response = await fetch('/api/protected/dev-reports/baddata', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                filterType,
                                isNs,
                                showData
                            }),
                        });

                        if (!response.ok) {
                            throw new Error(`Error: ${response.statusText}`);
                        }

                        const reportContent = await response.json();
                        setReportContent(reportContent);
                    } catch (error) {
                        console.error('Error fetching bad data report:', error);
                        setReportContent(noReport);
                    } finally {
                        setLoading(false);
                    }
                    break;
                case 'stallingstegoed':
                    // Use the new protected API route
                    setLoading(true);
                    try {
                        const response = await fetch('/api/protected/dev-reports/stallingstegoed', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                filterType,
                                isNs,
                                showData
                            }),
                        });

                        if (!response.ok) {
                            throw new Error(`Error: ${response.statusText}`);
                        }

                        const reportContent = await response.json();
                        setReportContent(reportContent);
                    } catch (error) {
                        console.error('Error fetching stallingstegoed report:', error);
                        setReportContent(noReport);
                    } finally {
                        setLoading(false);
                    }
                    break;
                default:
                    setReportContent(noReport);
                    break;
            }
        }

        updateReport();
    }, [selectedReport, filterType, isNs, filterDateTime, showData]);

    const handleDownloadCSV = () => {
        if (reportContent) {
            const csv = convertToCSV(reportContent.data.records, reportContent.data.columns, reportContent.data.hidden || []);
            downloadCSV(csv, 'report.csv');
        }
    };

    const handleReportSelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedReport(event.target.value);
    };

    const handleFilterTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setFilterType(event.target.value);
    };

    const handleIsNsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setIsNs(event.target.value);
    };

    const handleFilterDateTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterDateTime(event.target.value);
    };

    const handleShowDataChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setShowData(event.target.checked);
    };

    // For now, we'll use a static list of types. In a real implementation, 
    // you might want to fetch this from an API endpoint
    const availabletypes = ["Buurtstalling", "Stationsstalling", "Overig"];

    return (
        <div className="flex h-screen flex-col border-green-400">
            <div className="flex flex-row mb-4 justify-between items-center">
                <div className="flex space-x-4 w-full">
                    <select
                        value={selectedReport}
                        onChange={handleReportSelection}
                        className="bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
                    >
                        <option value="" disabled>Select Report</option>
                        <option value="openclose">Open/Closing times</option>
                        <option value="baddata">Test for Bad Data</option>
                        <option value="stallingstegoed">Stallingstegoed</option>
                        {/* Add more options as needed */}
                    </select>

                    <select
                        value={filterType}
                        onChange={handleFilterTypeChange}
                        className="bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
                    >
                        <option value="">All Types</option>
                        {availabletypes.map((type: string) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>

                    <select
                        value={isNs}
                        onChange={handleIsNsChange}
                        className="bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
                    >
                        <option value="all">NS + Non-NS</option>
                        <option value="true">NS</option>
                        <option value="false">Non-NS</option>
                    </select>

                    <input
                        type="datetime-local"
                        value={filterDateTime}
                        onChange={handleFilterDateTimeChange}
                        className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
                    />

                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={showData}
                            onChange={handleShowDataChange}
                            className="form-checkbox h-5 w-5 text-green-600"
                        />
                        <span className="text-gray-700">Show Data</span>
                    </label>
                </div>
                <button
                    onClick={handleDownloadCSV}
                    className="bg-green-500 text-white px-4 py-2 rounded"
                >
                    Download as CSV
                </button>
            </div>

            {loading && (
                <div className="flex justify-center items-center">
                    <svg className="animate-spin h-8 w-8 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="ml-2 text-gray-600">Loading...</span>
                </div>
            )}
            {!loading && reportContent &&
                <div className="overflow-auto">
                    <ReportTable reportContent={reportContent} />
                </div>}
        </div>
    );
};

export default Report;
