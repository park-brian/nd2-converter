$(function () {
    // create shortcut for showing modals
    $.fn.showModal = function(title, body) {
        $(this).find('.modal-title').text(title);
        $(this).find('.modal-body').text(body);
        $(this).modal('show');
    }

    function pluralize(count, singular, plural) {
        var pluralForm = plural || singular + 's';
        return count === 1 ? singular : pluralForm;
    }

    // initialize custom bootstrap file inputs
    bsCustomFileInput.init();

    // show form submission results in a modal instead of a new page
    $('[onsubmit-modal]').submit(function (ev) {
        ev.preventDefault();
        var form = ev.target;
        var $submitModal = $(form.getAttribute('onsubmit-modal'));
        $submitModal.showModal('Please Wait', 'Submitting request...');
        
        $.ajax({
            type: 'POST',
            url: form.action,
            data: new FormData(form),
            contentType: false,
            processData: false,
            success: function(data) {
                $submitModal.showModal('Request Submitted', data);
            },
            error: function(jqXHR) {
                $submitModal.showModal('Error', jqXHR.responseText);
            }
          });
    });

    // initialize job status table
    $.getJSON('status', function(data) {
        console.log('data', data);
        var columns = [
            {
                data: 'inputKey',
                title: 'Source File',
                render: function(data, type, row) {
                    var filename = data.split('/').pop();
                    return (filename && row.fileSize > 0)
                        ? filename
                        : data;
                }
            },
            {
                data: 'fileSize',
                title: 'File Size',
                render: function(data, type, row) {
                    if (type !== 'display' && type !== 'filter')
                        return data;
                    if (data < 1024) {
                        return (+data) + ' b';
                    } else if (data < 1024 * 1024) {
                        return (+data/1024).toFixed(2) + ' KiB';
                    } else if (data < 1024 * 1024 * 1024) {
                        return (+data/1024/1024).toFixed(2) + ' MiB';
                    } else {
                        return (+data/1024/1024/1024).toFixed(2) + ' GiB';
                    }
                }
            },
            {
                data: 'elapsedTime',
                title: 'Conversion Time',
                render: function(data, type) {
                    if (type !== 'display' && type !== 'filter')
                        return data;

                    var minutes = Math.floor(data / 60);
                    var seconds = (data % 60).toFixed(2);

                    return [
                        data > 60 ? (minutes + ' ' + pluralize(minutes, 'min', 'mins')) : null,
                        seconds + ' ' + pluralize(seconds, 'sec', 'secs'),
                    ].filter(Boolean).join(', ');
                }
            },
            {
                data: 'status',
                title: 'Status',

                render: function(data, type, row) {
                    if (type !== 'display' && type !== 'filter')
                        return data;
                    return $('<span/>').text(data).attr('title', row.error).prop('outerHTML')
                }
            },
        ];
        
        $('#job-status-table').dataTable({
            data: data,
            columns: columns,
            dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" +
            "<'table-responsive mb-3'tr>" +
            "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
            pageLength: 25,
            lengthMenu: [25, 50, 100],
            order: [[3, 'asc']]
        })
        $('#status').DataTable();
    })

});
