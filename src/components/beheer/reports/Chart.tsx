"use client";

import dynamic from 'next/dynamic'
import { useEffect, useState } from "react";

const ApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,  // This will disable server-side rendering for this component
});
// https://stackoverflow.com/a/68844119
// const ApexCharts: any = dynamic(() => import('react-apexcharts'), { ssr: false });// https://stackoverflow.com/a/70010953
// https://github.com/apexcharts/react-apexcharts/issues/526#issuecomment-1735973058

// After state change of parent component, the graph data is gone.
// I tried: https://github.com/apexcharts/react-apexcharts/issues/180

const Chart = ({
  options,
  series,
  type,
  style,
  height,
}: {
  options: object,
  series: Array<any>,
  type: 'line' | 'bar' | 'pie',
  style?: object,
  height?: number | string,
}) => {
  // const [chartData, setChartData] = useState<{
  //   options?: object,
  //   series?: Array<any>
  // }>({})

  // useEffect(() => {
  //   if (!options || !options.xaxis.categories) {
  //     return;
  //   }

  //   setChartData({
  //     options: {
  //       ...options,
  //       xaxis: {
  //         categories: options.xaxis.categories
  //       }
  //     },
  //     series: series
  //   });
  // }, [
  //   // If you uncomment this, problems on the x-axis will occur.
  //   // options,
  //   // series
  // ]);

  // if (!chartData.options || !chartData.series) {
  //   return <>Loading..</>
  // }

  const chartHeight = height ?? "100%";

  return (
    <>
      <div style={{ width: '100%', height: chartHeight }}>
        {options && series && (
          <ApexChart
            options={options}
            series={series}
            type={type}
            height={chartHeight}
            style={{ minHeight: typeof height === "number" ? height : "400px", ...style }}
          />
        )}
      </div>
    </>
  )
}

export default Chart;
