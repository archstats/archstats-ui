/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        container: {
            padding: '2rem',
            center: true,
        },
        extend: {
            colors: {
                'archstats': {
                    50: '#faf5ff',
                    100: '#f3e8ff',
                    200: '#e9d5ff',
                    300: '#d8b4fe',
                    400: '#c084fc',
                    500: '#a855f7',
                    600: '#9333ea',
                    700: '#7e22ce',
                    800: '#6b21a8',
                    900: '#581c87',
                },
                'archstats-tertiary': {

                    50: '#c3cdea',
                    100: '#b4c1e4',
                    200: '#a4b4df',
                    300: '#778fcf',
                    400: '#5976c5',
                    500: '#3d5bae',
                    600: '#3a57a6',
                    700: '#354f97',
                    800: '#304788',
                    900: '#2a3f79'
                }
                ,
                'archstats-secondary': {
                    50: '#ffd699',
                    100: '#ffce85',
                    200: '#ffc670',
                    300: '#ffbe5c',
                    400: '#f59300',
                    500: '#dc8400',
                    600: '#cc7a00',
                    700: '#b86e00',
                    800: '#a36200',
                    900: '#8f5600',
                },
                'archstats-primary': {
                    50: '#bbc4dd',
                    100: '#aeb8d6',
                    200: '#92a0c8',
                    300: '#8594c1',
                    400: '#6a7bc4',
                    500: '#5266a3',
                    600: '#4b5e95',
                    700: '#445588',
                    800: '#37446d',
                    900: '#27314e',
                },
                'white': '#fbfeff',
            }
        },
    },
    plugins: [],
}
